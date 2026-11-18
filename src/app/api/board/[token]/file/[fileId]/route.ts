import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { fail } from '@/lib/server/agreements/core';
import { cpFail, fileResponse, projectByToken } from '@/lib/server/clientProjects/http';
import { publicAttachment } from '@/lib/server/clientProjects/service';

type Ctx = { params: Promise<{ token: string; fileId: string }> };

const DAILY_BYTES = 1024 * 1024 * 1024;
const gb = globalThis as typeof globalThis & { __cpBoardBytes?: Map<string, number> };
const spent = (gb.__cpBoardBytes ??= new Map<string, number>());
/** Count `n` bytes against the project's budget for today (UTC day); false when it would go over. */
function spendBytes(projectId: string, n: number): boolean {
  const key = `${projectId}|${new Date().toISOString().slice(0, 10)}`;
  const used = spent.get(key) ?? 0;
  if (used + n > DAILY_BYTES) return false;
  if (spent.size > 5000) spent.clear();
  spent.set(key, used + n);
  return true;
}

/**
 * GET /api/board/:token/file/:fileId   (public; the link token is the credential)
 * Downloads one card attachment, and only one the owner marked client-visible, on a card that is shown
 * on the client board, in this project. Everything else is a 404. Rate-limited per link and per address.
 */
export async function GET(req: NextRequest, c: Ctx) {
  const { token, fileId } = await c.params;
  const found = await projectByToken(req, token);
  if (found instanceof NextResponse) return found;
  // CPV2-L6: per link overall and per address (every request), per link per file (5 downloads in 10 minutes,
  // counted only once the file is one this link may download), and a daily byte budget per project (1 GB).
  // In-memory per server instance, like every limiter here.
  if (!rateLimit(`cp-pub-file:${found.tokenKey}`, 120, 10 * 60_000) || !rateLimit(`cp-pub-file-ip:${found.ip}`, 60, 10 * 60_000)) return fail(429, 'Too many downloads. Wait a few minutes and try again.');
  try {
    const { file, bytes } = await publicAttachment(found.project, fileId, (f) => rateLimit(`cp-pub-file1:${found.tokenKey}:${f.id}`, 5, 10 * 60_000));
    if (!spendBytes(found.project.id, bytes.length)) return fail(429, 'This board has reached its download allowance for today. Try again tomorrow, or ask your Appointmentlyy contact.');
    return fileResponse(bytes, file.mime, file.name, true);
  } catch (err) {
    return cpFail(err, 'board file');
  }
}
