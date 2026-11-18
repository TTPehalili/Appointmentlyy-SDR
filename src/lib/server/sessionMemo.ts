/**
 * Very short in-process memo for the live session check (getServerSession).
 *
 * Why: one browser action runs the same storage-backed check several times within a few hundred
 * milliseconds (the proxy gate, then the route handler, then the parallel API calls a page fires),
 * and every storage query is a network round trip.
 *
 * SECURITY TRADE-OFF: a positive result is reused for at most SESSION_MEMO_TTL_MS (3 seconds).
 * - Changes made through this server process (password change or reset, member removed or role
 *   changed, workspace suspended or edited, invites, sign-in) clear the whole memo straight away:
 *   every tenant-store write does it (see getTenantStore). Logout and workspace switch also drop
 *   the entry of the cookie they replace.
 * - Changes this process cannot see (another instance, or SQL run directly on the database) take
 *   effect after at most 3 seconds instead of immediately.
 * Rules that keep it safe:
 * - only a signed-in (positive) result is ever stored; "not signed in" is checked live every time;
 * - the key is a SHA-256 of the session cookie value, which is the only identity input, so an
 *   entry can only be read back by presenting the identical cookie. The cookie is never stored or logged;
 * - the caller verifies the cookie's signature and expiry before every lookup;
 * - every caller gets its own copy of the result;
 * - the map is bounded (oldest entries are evicted).
 */
import crypto from 'node:crypto';

export const SESSION_MEMO_TTL_MS = 3000;
const MAX_ENTRIES = 500;

interface Entry {
  /** When the value was stored (ms). */
  at: number;
  value?: unknown;
  /** A check that is still running; requests arriving meanwhile wait for it instead of starting another. */
  flight?: Promise<unknown>;
}

// On globalThis so the proxy bundle and the route-handler bundles (separate module graphs in one
// Node process) share a single map, and so every writer clears the map every reader uses.
const KEY = Symbol.for('appointmentlyy.sessionMemo.v1');
const g = globalThis as unknown as Record<symbol, Map<string, Entry> | undefined>;
const map: Map<string, Entry> = (g[KEY] ??= new Map());

const keyOf = (cookieValue: string) => crypto.createHash('sha256').update(cookieValue).digest('hex');

function makeRoom(now: number) {
  // Prune expired entries on every insert (at most 500, cheap) so old session data does not linger in memory.
  for (const [k, e] of map) if (!e.flight && now - e.at >= SESSION_MEMO_TTL_MS) map.delete(k);
  while (map.size >= MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/**
 * Run `load` for this cookie, or reuse a positive result from the last 3 seconds. A null result
 * (not signed in) and a thrown error are never stored.
 */
export async function memoSession<T extends object>(cookieValue: string, load: () => Promise<T | null>): Promise<T | null> {
  const key = keyOf(cookieValue);
  const now = Date.now();
  const hit = map.get(key);
  if (hit) {
    if (hit.flight) {
      const shared = (await hit.flight) as T | null;
      return shared ? structuredClone(shared) : null;
    }
    if (now - hit.at < SESSION_MEMO_TTL_MS) return structuredClone(hit.value as T);
    map.delete(key);
  }

  makeRoom(now);
  const entry: Entry = { at: now };
  const flight = load();
  entry.flight = flight;
  map.set(key, entry);
  try {
    const value = await flight;
    // Store only if nothing invalidated this entry while the check ran.
    if (map.get(key) === entry) {
      if (value) {
        entry.flight = undefined;
        entry.value = value;
        entry.at = Date.now();
      } else {
        map.delete(key);
      }
    }
    return value ? structuredClone(value) : null;
  } catch (err) {
    if (map.get(key) === entry) map.delete(key);
    throw err;
  }
}

/** Drop one cookie's entry (logout, workspace switch). */
export function forgetSession(cookieValue: string | undefined | null) {
  if (cookieValue) map.delete(keyOf(cookieValue));
}

/** Drop everything: called after every write that can change who is allowed in. */
export function clearSessionMemo() {
  map.clear();
}
