/**
 * Per-person request limit for API routes (fixed window, in memory, per server process).
 *
 * applyRateLimit in src/lib/security.ts counts by IP address only, in one bucket shared by every route
 * that uses it: a whole office behind one address shares a single counter. Routes that many people in
 * the same office use at once (Lead Finder counts) are limited per signed-in person and per route here.
 */
import { NextResponse } from 'next/server';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
}

/** Null when allowed, or the 429 to send. `scope` names the route; `who` is the session's workspace + email. */
export function limitPerUser(
  scope: string,
  who: { tenantCode: string; email: string },
  options: { maxRequests: number; windowMs?: number },
): NextResponse | null {
  const windowMs = options.windowMs ?? 60_000;
  const now = Date.now();
  sweep(now);
  const key = `${scope}|${who.tenantCode}|${who.email.toLowerCase()}`;
  const cur = buckets.get(key);
  if (!cur || now > cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (cur.count >= options.maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((cur.resetAt - now) / 1000));
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please slow down and try again in a moment.', retryAfterSeconds: retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } },
    );
  }
  cur.count += 1;
  return null;
}
