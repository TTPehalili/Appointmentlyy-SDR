/**
 * In-memory sliding-window limiter (one long-running Node service, so per-process is enough).
 * Counts units (e.g. events), not requests.
 */
type Bucket = { stamps: number[] };

export class SlidingWindowLimiter {
  private buckets = new Map<string, Bucket>();
  private lastSweep = 0;
  private limit: number;
  private windowMs: number;
  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }
  /** Take `units` if they fit; otherwise nothing is taken and the wait (ms) until they would fit is returned. */
  take(key: string, units = 1, now = Date.now()): { ok: true } | { ok: false; retryAfterMs: number } {
    this.sweep(now);
    const b = this.buckets.get(key) ?? { stamps: [] };
    b.stamps = b.stamps.filter((t) => t > now - this.windowMs);
    if (units > this.limit) return { ok: false, retryAfterMs: this.windowMs };
    if (b.stamps.length + units > this.limit) {
      const freeAt = b.stamps[b.stamps.length + units - this.limit - 1] + this.windowMs;
      this.buckets.set(key, b);
      return { ok: false, retryAfterMs: Math.max(1000, freeAt - now) };
    }
    for (let i = 0; i < units; i++) b.stamps.push(now);
    this.buckets.set(key, b);
    return { ok: true };
  }
  private sweep(now: number) {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [k, b] of this.buckets) if (!b.stamps.some((t) => t > now - this.windowMs)) this.buckets.delete(k);
  }
}

const g = globalThis as typeof globalThis & { __appyIntegrationLimiters?: Map<string, SlidingWindowLimiter> };

/** Process-wide named limiter (survives separate module instances). */
export function limiter(name: string, limit: number, windowMs: number): SlidingWindowLimiter {
  g.__appyIntegrationLimiters ??= new Map();
  let l = g.__appyIntegrationLimiters.get(name);
  if (!l) {
    l = new SlidingWindowLimiter(limit, windowMs);
    g.__appyIntegrationLimiters.set(name, l);
  }
  return l;
}
