/** Server only. Shared request plumbing for the /api/client-projects and /api/board route handlers. */
import { NextResponse, type NextRequest } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import type { ServerSession } from '@/lib/server/session';
import { PRIVATE_HEADERS, TOKEN_RE, clientIp, fail, tokenHashOf } from '@/lib/server/agreements/core';
import { getClientProjectStore, isCpId } from '@/lib/server/clientProjectStore';
import { requireProjectOwner, storageFail } from '@/lib/server/clientProjects/core';
import { CpError, type Ctx } from '@/lib/server/clientProjects/service';
import type { Project } from '@/lib/clientProjects/types';

export function cpFail(err: unknown, what: string): NextResponse {
  if (err instanceof CpError) return fail(err.status, err.message, err.extra);
  return storageFail(err, what);
}

export interface OwnerCtx {
  owner: ServerSession;
  project: Project;
  ctx: Ctx;
}

/** Owner guard + rate limit + id check + project lookup, for every /api/client-projects/:id route. */
export async function ownerProject(req: NextRequest, id: string, bucket: 'read' | 'write' | 'upload' | 'ai' = 'write'): Promise<OwnerCtx | NextResponse> {
  const owner = await requireProjectOwner(req, bucket);
  if (owner instanceof NextResponse) return owner;
  if (!isCpId(id)) return fail(404, 'Project not found.');
  try {
    const project = await getClientProjectStore().getProject(id);
    if (!project) return fail(404, 'Project not found.');
    return { owner, project, ctx: { actor: `owner:${owner.email}`, origin: req.nextUrl.origin, ownerName: owner.name } };
  } catch (err) {
    return storageFail(err, 'load');
  }
}

const NOT_FOUND = () => fail(404, 'This link is not valid.', { state: 'closed' });

/**
 * Misses per address (well-formed tokens that match nothing): 30 in 10 minutes. Kept here, not in the
 * shared rateLimit, because it has to be READ before the database is asked and only COUNTED after a miss:
 * an address that is guessing tokens gets its 429 without costing a lookup.
 */
const MISS_MAX = 30;
const MISS_WINDOW_MS = 10 * 60_000;
const gm = globalThis as typeof globalThis & { __cpBoardMisses?: Map<string, number[]> };
const misses = (gm.__cpBoardMisses ??= new Map<string, number[]>());
function recentMisses(ip: string): number[] {
  const now = Date.now();
  const recent = (misses.get(ip) ?? []).filter((t) => now - t < MISS_WINDOW_MS);
  if (recent.length) misses.set(ip, recent);
  else misses.delete(ip);
  return recent;
}
const missBlocked = (ip: string) => recentMisses(ip).length >= MISS_MAX;
function recordMiss(ip: string): void {
  const recent = recentMisses(ip);
  recent.push(Date.now());
  misses.set(ip, recent);
  if (misses.size > 20_000) for (const k of misses.keys()) if (!recentMisses(k).length) misses.delete(k);
}

/**
 * The project for a board link token, or the response to send (429 / 404). Same shape as the
 * Agreements signer guard: per-IP and per-token limits, a format check, a constant-time lookup by
 * sha256(token), and a budget for misses that is checked before the lookup. A project whose sharing is off is a 404, exactly
 * like a token that never existed. The token is never logged.
 */
export async function projectByToken(req: NextRequest, token: string): Promise<{ project: Project; ip: string; tokenKey: string } | NextResponse> {
  const ip = clientIp(req);
  if (!rateLimit(`cp-pub-ip:${ip}`, 240, 60_000)) return fail(429, 'Too many requests. Wait a minute and try again.');
  if (!TOKEN_RE.test(token)) {
    if (!rateLimit(`cp-pub-bad:${ip}`, 30, 10 * 60_000)) return fail(429, 'Too many requests. Wait a few minutes and try again.');
    return NOT_FOUND();
  }
  // Before any lookup: an address that keeps missing is refused without touching the database.
  if (missBlocked(ip)) return fail(429, 'Too many requests. Wait a few minutes and try again.');
  const tokenHash = tokenHashOf(token);
  const tokenKey = tokenHash.slice(0, 24);
  if (!rateLimit(`cp-pub-tok:${tokenKey}`, 180, 60_000)) return fail(429, 'Too many requests. Wait a minute and try again.');
  let project: Project | null;
  try {
    project = await getClientProjectStore().findByTokenHash(tokenHash);
  } catch (err) {
    return storageFail(err, 'board');
  }
  if (!project || !project.shareEnabled) {
    recordMiss(ip);
    return NOT_FOUND();
  }
  return { project, ip, tokenKey };
}

/** Resolves when `p` does, or after `ms` (the work carries on): lazy sweeps must not hold a response. */
export const atMost = (p: Promise<unknown>, ms: number): Promise<void> =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    p.catch(() => undefined).finally(() => {
      clearTimeout(t);
      resolve();
    });
  });

/** The request body, or null as soon as it exceeds `max` bytes (the rest is not read). */
export async function readCapped(req: NextRequest, max: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > max) return null;
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

/** A card of this project, or the 404 to send (ids from another project are simply not found). */
export async function ownerTask(req: NextRequest, id: string, taskId: string, bucket: 'read' | 'write' | 'upload' | 'ai' = 'write'): Promise<(OwnerCtx & { task: import('@/lib/clientProjects/types').Task }) | NextResponse> {
  const owner = await requireProjectOwner(req, bucket);
  if (owner instanceof NextResponse) return owner;
  if (!isCpId(id)) return fail(404, 'Project not found.');
  if (!isCpId(taskId)) return fail(404, 'Card not found.');
  try {
    // The project and the card in ONE round trip; the card must belong to the project.
    const store = getClientProjectStore();
    const [project, task] = await Promise.all([store.getProject(id), store.getTask(taskId)]);
    if (!project) return fail(404, 'Project not found.');
    if (!task || task.projectId !== project.id) return fail(404, 'Card not found.');
    return { owner, project, task, ctx: { actor: `owner:${owner.email}`, origin: req.nextUrl.origin, ownerName: owner.name } };
  } catch (err) {
    return storageFail(err, 'task load');
  }
}

/** Inline (owner viewing) or as a download; never sniffed, never cached, never indexed. */
export function fileResponse(bytes: Uint8Array, mime: string, name: string, download: boolean): NextResponse {
  const safe = name.replace(/[^\w.\- ]+/g, '_').slice(0, 150) || 'file';
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      'Content-Type': mime,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      // Only PDF, PNG or JPEG ever get here (checked by their magic bytes on upload), served as exactly that
      // type with nosniff. (The app's global headers in next.config.ts set the CSP for every response.)
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
      // Defence in depth (security review M1): anything but a PDF runs in a sandbox with no script and no fetches, even
      // if it were ever opened inline. (PDFs keep the browser's own viewer.)
      ...(mime === 'application/pdf' ? {} : { 'Content-Security-Policy': FILE_CSP }),
    },
  });
}

/** The policy for served non-PDF files (also excluded from next.config's frame-ancestors-only policy, which would replace it). */
export const FILE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'";

