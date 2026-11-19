import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { fail, json } from '@/lib/server/agreements/core';
import { cpFail, projectByToken, readCapped } from '@/lib/server/clientProjects/http';
import { clientDailyCapReached } from '@/lib/server/clientProjects/service';
import { clientUpload } from '@/lib/server/clientProjects/intake';
import { INTAKE_LIMITS } from '@/lib/clientProjects/intake';

type Ctx = { params: Promise<{ token: string }> };

/**
 * POST /api/board/:token/intake/upload?requestId=&field=   (public; the link token is the credential)
 * The raw file is the body (one file per request, at most 9 MB; the Content-Length must match what arrives, so a
 * body cut short anywhere on the way is refused). Headers: X-File-Name (URI-encoded), X-Person-Name or X-Person-Id.
 * The type is decided from the bytes and the structure (uploads.ts), never from the headers. The file joins the
 * item's working set; it is NEVER served back to the board (only the owner downloads it, as an attachment).
 * field = a file field's key, a CSV table's key (the reply carries the parsed rows; nothing is created), or
 * "__receipt" on a payment item.
 */
export async function POST(req: NextRequest, c: Ctx) {
  const { token } = await c.params;
  const found = await projectByToken(req, token);
  if (found instanceof NextResponse) return found;
  if (!rateLimit(`cp-intake-up:${found.tokenKey}`, 60, 10 * 60_000) || !rateLimit(`cp-intake-up-ip:${found.ip}`, 40, 10 * 60_000)) return fail(429, 'Too many uploads. Wait a few minutes and try again.');
  const { project } = found;
  if (project.status === 'archived') return fail(409, 'This board is closed.');
  const declared = Number(req.headers.get('content-length') || 0);
  if (!declared) return fail(411, 'Send the file with its length.');
  if (declared > INTAKE_LIMITS.fileBytes) return fail(413, `The file is larger than ${Math.round(INTAKE_LIMITS.fileBytes / 1024 / 1024)} MB.`);
  const bytes = await readCapped(req, INTAKE_LIMITS.fileBytes);
  if (!bytes) return fail(413, `The file is larger than ${Math.round(INTAKE_LIMITS.fileBytes / 1024 / 1024)} MB.`);
  if (bytes.length !== declared) return fail(400, 'The upload did not arrive complete. Try again.');
  let name = '';
  try {
    name = decodeURIComponent(req.headers.get('x-file-name') || '').slice(0, 300);
  } catch {
    return fail(400, 'The file name could not be read.');
  }
  let personName: unknown = '';
  try {
    personName = decodeURIComponent(req.headers.get('x-person-name') || '').slice(0, 120);
  } catch {
    personName = '';
  }
  const personId = req.headers.get('x-person-id');
  if (personId) {
    const person = (project.people ?? []).find((x) => x.id === personId && x.side === 'client');
    if (person) personName = person.name;
  }
  const sp = req.nextUrl.searchParams;
  try {
    if (await clientDailyCapReached(project)) return fail(429, 'This board has had a lot of activity today. Please try again tomorrow, or contact us directly.');
    const out = await clientUpload(project, { requestId: sp.get('requestId'), field: sp.get('field') ?? '', name, personName }, bytes, req.nextUrl.origin);
    const { file } = out;
    return json({ success: true, file: { id: file.id, name: file.name, size: file.size, mime: file.mime, field: file.field }, ...(out.csv ? { csv: out.csv } : {}) });
  } catch (err) {
    return cpFail(err, 'board intake upload');
  }
}
