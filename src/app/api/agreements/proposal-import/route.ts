import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { fail, loadSettings, PRIVATE_HEADERS, requireOwner } from '@/lib/server/agreements/core';
import { profileOf } from '@/lib/agreements/customProposalV2';
import { importProposalPdf } from '@/lib/server/agreements/proposalImport';
import { PROPOSAL_LIMITS, cleanLine } from '@/lib/agreements/customProposal';

/** Reading a long proposal is up to four parts (two at a time), each up to 150 s, plus one retry. */
export const maxDuration = 600;

const MB = Math.floor(PROPOSAL_LIMITS.uploadBytes / 1024 / 1024);
/** Next's default experimental.proxyClientMaxBodySize (node_modules/next/dist/docs/.../proxyClientMaxBodySize.md). */
const PROXY_BODY_CAP = 10 * 1024 * 1024;

/** The request body, or null as soon as it exceeds `max` bytes (the rest is not read). */
async function readCapped(req: NextRequest, max: number): Promise<Uint8Array | null> {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * POST /api/agreements/proposal-import   (platform owner only)
 * Body: the PDF itself (Content-Type: application/pdf, file name in X-File-Name), at most 10 MB and 30 pages.
 * Reply: NDJSON, one JSON object per line: { type: 'progress', stage, message, done?, total? } lines while it
 * works, then one { type: 'result', ok, ... } (see ImportResult). Nothing is stored: the PDF is read in
 * memory for this request and dropped; the owner saves the resulting document as a draft.
 */
export async function POST(req: NextRequest) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/pdf') return fail(415, 'Upload a PDF file.');
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > PROPOSAL_LIMITS.uploadBytes) return fail(413, `The file is larger than ${MB} MB.`);
  const bytes = await readCapped(req, PROPOSAL_LIMITS.uploadBytes);
  if (!bytes) return fail(413, `The file is larger than ${MB} MB.`);
  // Behind src/proxy.ts, Next buffers at most proxyClientMaxBodySize (10 MB) and silently cuts the rest: a body of
  // exactly that size with no declared length is a cut-off file, not a PDF to read.
  if (!declared && bytes.length >= PROXY_BODY_CAP) return fail(413, `The file is larger than ${MB} MB.`);
  // A PDF by its magic bytes, whatever the file name or declared type says.
  if (bytes.length < 100 || Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') return fail(415, 'This file is not a PDF.');
  // Counted only for real PDFs (each import is up to a few AI calls on the platform key).
  if (!rateLimit(`agr-proposal-import:${owner.email}`, 20, 10 * 60_000)) return fail(429, 'Too many imports in a short time. Wait a few minutes.');
  let name = 'proposal.pdf';
  try {
    name = cleanLine(decodeURIComponent(req.headers.get('x-file-name') || ''), 180) || name;
  } catch {
    /* keep the default name */
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (o: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
        } catch {
          open = false; // the owner closed the page: keep going quietly, nothing is stored anyway
        }
      };
      try {
        // New proposals are v2; the owner's sign-off comes from settings (never from the AI).
        const profile = profileOf((await loadSettings()).settings);
        const result = await importProposalPdf(bytes, name, (p) => send({ type: 'progress', ...p }), { v2: profile });
        send({ type: 'result', ...result });
      } catch (err) {
        console.error('[agreements/proposal-import]', err);
        send({ type: 'result', ok: false, code: 'ai_failed', message: 'Something went wrong while reading the PDF. You can start from an empty document instead.', pages: 0, scannedPages: [], fallback: null });
      } finally {
        bytes.fill(0);
        if (open) controller.close();
      }
    },
  });
  return new NextResponse(stream, { status: 200, headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });
}
