import { after, NextRequest, NextResponse } from 'next/server';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { getAgreementStore, isEnvelopeId } from '@/lib/server/agreementStore';
import { getClientProjectStore, isCpId, sha256Hex } from '@/lib/server/clientProjectStore';
import { line } from '@/lib/server/clientProjects/core';
import { cpFail, ownerProject, type OwnerCtx } from '@/lib/server/clientProjects/http';
import { looksLikePdf, pdfPageCount } from '@/lib/server/clientProjects/pdfText';
import { AI_OFF_MESSAGE, aiMode, startAiRun } from '@/lib/server/clientProjects/ai';
import { CP_LIMITS } from '@/lib/clientProjects/types';

type Ctx = { params: Promise<{ id: string }> };

// A draft is up to two model calls of up to 180 seconds each (PLANNER_TIMEOUT_MS), run after the response.
export const maxDuration = 420;

/**
 * GET /api/client-projects/:id/files   (owner only)
 * The project's documents (names, sizes, hashes; never the bytes) and the completed agreements that
 * can be attached. Documents are stored for the AI planner only: no route serves them back, and
 * nothing here is reachable from the client board.
 */
export async function GET(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'read');
  if (o instanceof NextResponse) return o;
  try {
    // Planner documents only ('doc'): card attachments share the table but are never listed here,
    // never count against the 12-document cap and are never read by the planner.
    // The documents and the completed agreements in parallel. A failing document list is NOT swallowed
    // (it is a 5xx the panel shows); only the optional agreements list degrades to empty.
    const [files, envelopes] = await Promise.all([getClientProjectStore().listFiles(id, 'doc'), getAgreementStore().listEnvelopes().catch(() => [])]);
    const attached = new Set(files.map((f) => f.source));
    const agreements = envelopes
      .filter((e) => e.status === 'completed' && e.finalSha256 && e.templateMeta?.action !== 'view')
      // Newest first BEFORE the cap, so a long history never hides the agreement just signed.
      .sort((a, b) => String(b.completedAt ?? '').localeCompare(String(a.completedAt ?? '')))
      .slice(0, 50)
      .map((e) => ({ id: e.id, title: e.title, completedAt: e.completedAt, attached: attached.has(`agreement:${e.id}`) }));
    return json({ success: true, files, agreements, limits: { bytes: CP_LIMITS.fileBytes, files: CP_LIMITS.filesPerProject } });
  } catch (err) {
    return cpFail(err, 'files');
  }
}

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

async function store(o: OwnerCtx, name: string, bytes: Uint8Array, source: string): Promise<NextResponse> {
  const s = getClientProjectStore();
  // PDF only, by its magic bytes, and it must actually parse as one.
  if (!looksLikePdf(bytes)) return fail(400, `Upload a PDF of at most ${Math.floor(CP_LIMITS.fileBytes / 1024 / 1024)} MB.`);
  const existing = await s.listFiles(o.project.id, 'doc');
  if (existing.length >= CP_LIMITS.filesPerProject) return fail(409, `A project holds at most ${CP_LIMITS.filesPerProject} documents. Remove one first.`);
  const sha = sha256Hex(bytes);
  if (existing.some((f) => f.sha256 === sha)) return fail(409, 'This document is already attached to the project.');
  const pages = await pdfPageCount(bytes);
  if (!pages) return fail(400, 'This file could not be read as a PDF.');
  const file = await s.putFile({ projectId: o.project.id, name: line(name, 180).replace(/[\\/:*?"<>|]+/g, '-') || 'document.pdf', pages, source, taskId: null, clientVisible: false, mime: 'application/pdf' }, bytes);
  await s.addEvent({ projectId: o.project.id, taskId: null, actor: o.ctx.actor, type: 'file_added', detail: { name: file.name, pages, size: file.size, sha256: file.sha256, source } });
  // The AI plan starts by itself as soon as a document is in: no separate "run" click.
  const started = await startAiRun(o.project.id, o.ctx.actor);
  if (started?.work) after(started.work);
  return json({ success: true, file, ai: aiMode(), run: started ? { id: started.run.id, status: started.run.status } : null, ...(started ? {} : { aiMessage: AI_OFF_MESSAGE }) });
}

/**
 * POST /api/client-projects/:id/files   (owner only)
 * Body: the PDF itself (Content-Type: application/pdf, name in X-File-Name), or JSON
 * { agreementId } to attach a completed agreement's final signed PDF.
 */
export async function POST(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'upload');
  if (o instanceof NextResponse) return o;
  try {
    const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (type === 'application/json') {
      const body = await readJson(req, 1024);
      const agreementId = body?.agreementId;
      if (typeof agreementId !== 'string' || !isEnvelopeId(agreementId)) return fail(400, 'Pick a completed agreement.');
      const envelope = await getAgreementStore().getEnvelope(agreementId);
      if (!envelope || envelope.status !== 'completed') return fail(404, 'That agreement is not completed.');
      const final = await getAgreementStore().getFile(agreementId, 'final');
      if (!final || final.mime !== 'application/pdf') return fail(404, 'The signed PDF for that agreement is not available.');
      return await store(o, `${envelope.title}.pdf`, final.bytes, `agreement:${agreementId}`);
    }
    if (type !== 'application/pdf') return fail(415, 'Upload a PDF file.');
    const declared = Number(req.headers.get('content-length') || 0);
    if (declared > CP_LIMITS.fileBytes) return fail(413, `The file is larger than ${Math.floor(CP_LIMITS.fileBytes / 1024 / 1024)} MB.`);
    // Content-Length can be missing or wrong: count the bytes as they arrive and stop at the cap.
    const bytes = await readCapped(req, CP_LIMITS.fileBytes);
    if (!bytes) return fail(413, `The file is larger than ${Math.floor(CP_LIMITS.fileBytes / 1024 / 1024)} MB.`);
    let name = 'document.pdf';
    try {
      name = decodeURIComponent(req.headers.get('x-file-name') || '') || name;
    } catch {
      /* keep the default name */
    }
    return await store(o, name, bytes, 'upload');
  } catch (err) {
    return cpFail(err, 'upload');
  }
}

/** DELETE /api/client-projects/:id/files?fileId=... -> remove a document (owner only). */
export async function DELETE(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id);
  if (o instanceof NextResponse) return o;
  const fileId = req.nextUrl.searchParams.get('fileId') || '';
  if (!isCpId(fileId)) return fail(404, 'Document not found.');
  try {
    const s = getClientProjectStore();
    const file = (await s.listFiles(id)).find((f) => f.id === fileId);
    if (!file) return fail(404, 'Document not found.');
    await s.deleteFile(fileId);
    await s.addEvent({ projectId: id, taskId: null, actor: o.ctx.actor, type: 'file_removed', detail: { name: file.name, sha256: file.sha256 } });
    return json({ success: true });
  } catch (err) {
    return cpFail(err, 'file delete');
  }
}
