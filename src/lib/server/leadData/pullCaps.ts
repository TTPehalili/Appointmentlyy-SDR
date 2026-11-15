/**
 * Interim server-side caps on paid lead pulls (security audit H-2).
 *
 * The workspace lead quota lives in the browser, so the server enforces its own limits on every
 * paid call (a pull, or a single LinkedIn-URL enrich counted as 1), whatever the request says:
 *  - at most LEAD_PULL_MAX_PER_REQUEST leads in one pull (default 500);
 *  - at most LEAD_PULL_MAX_PER_USER_HOUR leads per person in any rolling hour (default 1,000);
 *  - at most LEAD_PULL_MAX_PER_TENANT_DAY leads per workspace in any rolling 24 hours (default 2,000).
 * Free counts (size mode) are never capped.
 *
 * A pull reserves its planned count before any provider call (so parallel requests can't slip past
 * a cap) and is settled to the number of leads actually returned when it ends.
 *
 * INTERIM: the counters are in-process memory, keyed by workspace code and user email. They reset
 * when the server restarts and are not shared between instances. The server-side credit ledger per
 * workspace (Supabase, see the security audit) replaces this after the demo.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface LeadPullLimits {
  perRequest: number;
  perUserHour: number;
  perTenantDay: number;
}

function envLimit(name: string, fallback: number): number {
  const n = Math.floor(Number(process.env[name]));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function leadPullLimits(): LeadPullLimits {
  return {
    perRequest: envLimit('LEAD_PULL_MAX_PER_REQUEST', 500),
    perUserHour: envLimit('LEAD_PULL_MAX_PER_USER_HOUR', 1000),
    perTenantDay: envLimit('LEAD_PULL_MAX_PER_TENANT_DAY', 2000),
  };
}

interface Grant {
  at: number;
  count: number;
}

// One Grant object sits in both windows, so settling it updates both.
const userWindows = new Map<string, Grant[]>();
const tenantWindows = new Map<string, Grant[]>();

function live(map: Map<string, Grant[]>, key: string, windowMs: number, now: number): Grant[] {
  const kept = (map.get(key) || []).filter((g) => g.at > now - windowMs && g.count > 0);
  if (kept.length) map.set(key, kept);
  else map.delete(key);
  return kept;
}

const used = (grants: Grant[]) => grants.reduce((sum, g) => sum + g.count, 0);

/** Seconds until enough of the window expires for `count` more leads to fit under `limit`. */
function secondsUntilFits(grants: Grant[], windowMs: number, limit: number, count: number, now: number): number {
  let total = used(grants);
  for (const g of [...grants].sort((a, b) => a.at - b.at)) {
    if (total + count <= limit) break;
    total -= g.count;
    if (total + count <= limit) return Math.max(1, Math.ceil((g.at + windowMs - now) / 1000));
  }
  return Math.max(1, Math.ceil(windowMs / 1000));
}

function waitText(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `about ${hours} hour${hours === 1 ? '' : 's'}`;
}

const fmt = (n: number) => n.toLocaleString('en-US');

export interface LeadPullReservation {
  /** Record what the call really used (leads returned); never more than was reserved. */
  settle(actual: number): void;
}

export type LeadPullReserveResult =
  | { ok: true; reservation: LeadPullReservation }
  | {
      ok: false;
      status: 429;
      code: 'lead_pull_limit';
      limit: 'per_request' | 'per_user_hour' | 'per_workspace_day';
      error: string;
      retryAfterSeconds: number;
    };

/** Reserve `count` paid leads for this person and workspace, or say which cap stops it. */
export function reserveLeadPull(
  tenantCode: string,
  email: string,
  count: number,
  now = Date.now()
): LeadPullReserveResult {
  const limits = leadPullLimits();
  const want = Math.max(0, Math.floor(count));
  if (want > limits.perRequest) {
    return {
      ok: false,
      status: 429,
      code: 'lead_pull_limit',
      limit: 'per_request',
      error: `One pull can bring in at most ${fmt(limits.perRequest)} leads. Choose ${fmt(limits.perRequest)} or fewer and pull again. No credits were used.`,
      retryAfterSeconds: 1,
    };
  }

  const userKey = `${tenantCode.trim().toUpperCase()}|${email.trim().toLowerCase()}`;
  const tenantKey = tenantCode.trim().toUpperCase();
  const mine = live(userWindows, userKey, HOUR_MS, now);
  const team = live(tenantWindows, tenantKey, DAY_MS, now);

  const userUsed = used(mine);
  if (userUsed + want > limits.perUserHour) {
    const left = Math.max(0, limits.perUserHour - userUsed);
    const retry = secondsUntilFits(mine, HOUR_MS, limits.perUserHour, want, now);
    const wait = waitText(retry);
    return {
      ok: false,
      status: 429,
      code: 'lead_pull_limit',
      limit: 'per_user_hour',
      error:
        left > 0
          ? `You can pull ${fmt(left)} more lead${left === 1 ? '' : 's'} this hour (limit: ${fmt(limits.perUserHour)} per person per hour). Choose ${fmt(left)} or fewer, or try again in ${wait}. No credits were used.`
          : `You've reached the limit of ${fmt(limits.perUserHour)} leads per person per hour. Try again in ${wait}. No credits were used.`,
      retryAfterSeconds: retry,
    };
  }

  const teamUsed = used(team);
  if (teamUsed + want > limits.perTenantDay) {
    const left = Math.max(0, limits.perTenantDay - teamUsed);
    const retry = secondsUntilFits(team, DAY_MS, limits.perTenantDay, want, now);
    const wait = waitText(retry);
    return {
      ok: false,
      status: 429,
      code: 'lead_pull_limit',
      limit: 'per_workspace_day',
      error:
        left > 0
          ? `Your workspace can pull ${fmt(left)} more lead${left === 1 ? '' : 's'} today (limit: ${fmt(limits.perTenantDay)} per workspace per day). Choose ${fmt(left)} or fewer, or try again in ${wait}. No credits were used.`
          : `Your workspace has reached its limit of ${fmt(limits.perTenantDay)} leads per day. Try again in ${wait}, or ask Appointmentlyy support to raise it. No credits were used.`,
      retryAfterSeconds: retry,
    };
  }

  const grant: Grant = { at: now, count: want };
  if (want > 0) {
    userWindows.set(userKey, [...mine, grant]);
    tenantWindows.set(tenantKey, [...team, grant]);
  }
  return {
    ok: true,
    reservation: {
      settle(actual: number) {
        const n = Math.floor(Number(actual));
        grant.count = Math.min(want, Math.max(0, Number.isFinite(n) ? n : want));
      },
    },
  };
}
