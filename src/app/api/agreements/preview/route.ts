import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { cleanFieldValues, fail, findTemplate, pdfResponse, readJson, requireOwner } from '@/lib/server/agreements/core';

export const maxDuration = 60;

/** Owners with a preview render in flight on this server (PV2-M1: one at a time; an overlap gets 429). */
const inflight = ((globalThis as unknown as { __appyPreviewInflight?: Set<string> }).__appyPreviewInflight ??= new Set<string>());

/** POST /api/agreements/preview { templateId, values } -> the client-facing PDF (owner only, nothing saved). */
export async function POST(req: NextRequest) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  if (!rateLimit(`agr-preview:${owner.email}`, 40, 60_000)) return fail(429, 'Too many previews. Wait a minute.');
  const body = await readJson(req, 2 * 1024 * 1024);
  if (!body) return fail(400, 'Send the document details as JSON.');
  const t = findTemplate(String(body.templateId || ''));
  if (!t) return fail(400, 'Pick a template.');
  const key = owner.email.toLowerCase();
  if (inflight.has(key)) return fail(429, 'A preview is still being drawn. Try again in a moment.', { busy: true });
  inflight.add(key);
  try {
    const values = cleanFieldValues(t, body.values);
    const pdf = await t.render(values);
    return pdfResponse(pdf, `${t.id}-preview.pdf`);
  } catch (err) {
    console.error('[agreements/preview]', err);
    return fail(500, 'Could not draw the preview. Check the values and try again.');
  } finally {
    inflight.delete(key);
  }
}
