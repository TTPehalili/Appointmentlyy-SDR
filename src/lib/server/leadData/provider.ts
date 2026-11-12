/**
 * Lead Finder data provider plumbing shared by every provider: which provider answers, the local
 * test-mock override, pull limits, and the honest user-facing error messages.
 *
 * Provider choice (platform-wide, the same for every workspace):
 *  - GetLeads when GETLEADS_API_KEY is set, unless LEAD_DATA_PROVIDER=leadocean;
 *  - otherwise LeadOcean, exactly as before.
 * The browser never chooses the provider or supplies a GetLeads key.
 */
import type { LeadDataProviderId } from '@/lib/leadData/types';

export type LeadDataProvider =
  | { id: 'getleads'; apiKey: string }
  | { id: 'leadocean' };

export function selectLeadDataProvider(env: NodeJS.ProcessEnv = process.env): LeadDataProvider {
  const forced = (env.LEAD_DATA_PROVIDER || '').trim().toLowerCase();
  const getLeadsKey = (env.GETLEADS_API_KEY || '').trim();
  if (getLeadsKey && forced !== 'leadocean') return { id: 'getleads', apiKey: getLeadsKey };
  return { id: 'leadocean' };
}

export function activeLeadDataProviderId(): LeadDataProviderId {
  return selectLeadDataProvider().id;
}

const warnedFor = new Set<string>();
let warnedIgnored = false;

/**
 * Provider base URL. Tests can point it at a local mock with LEAD_DATA_TEST_BASE_URL, but only
 * outside production builds, or in a production build started locally with LEAD_DATA_TEST_MODE=1.
 * It is never honoured on Railway (live clients), whatever else is set. `suffix` is appended to
 * the override so a mock can serve the provider's real paths (GetLeads: '/api/v1').
 */
export function resolveLeadDataBaseUrl(defaultBaseUrl: string, suffix = ''): string {
  const override = (process.env.LEAD_DATA_TEST_BASE_URL || '').trim();
  if (!override) return defaultBaseUrl;
  const onRailway = Boolean(
    process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID
  );
  const allowed =
    !onRailway && (process.env.NODE_ENV !== 'production' || process.env.LEAD_DATA_TEST_MODE === '1');
  if (!allowed) {
    if (!warnedIgnored) {
      warnedIgnored = true;
      console.warn('[Appointmentlyy Data Cloud] LEAD_DATA_TEST_BASE_URL is set but ignored in this environment.');
    }
    return defaultBaseUrl;
  }
  const base = `${override.replace(/\/+$/, '')}${suffix}`;
  if (!warnedFor.has(defaultBaseUrl)) {
    warnedFor.add(defaultBaseUrl);
    console.warn(
      `\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n` +
        `[Appointmentlyy Data Cloud] TEST MODE: lead data provider calls go to ${base}\n` +
        `instead of ${defaultBaseUrl}. Never run like this for real clients.\n` +
        `!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`
    );
  }
  return base;
}

/** Rows per provider search page. A pull runs as many pages as it needs. */
export const PROVIDER_PAGE_SIZE = 100;
/** Most leads one pull request brings in (the largest pull size Lead Finder offers). */
export const MAX_PULL_PER_REQUEST = 1000;
/** At most ~10 `enriched` events a second (the last row of a page is always reported). */
export const ENRICH_PROGRESS_MIN_INTERVAL_MS = 100;

export const SYNCING_ERROR_MESSAGE =
  'Appointmentlyy Data Cloud is syncing high-volume clusters. Please retry in a moment.';

export interface IcpRouteResult {
  status: number;
  body: Record<string, unknown>;
}

/** Why the lead data provider refused a call. Only an empty 200 means "no matching profiles". */
export type ProviderErrorKind = 'quota' | 'rate_limited' | 'auth' | 'unavailable' | 'rejected';

const QUOTA_PATTERN = /fair[\s_-]*us(e|age)|quota|credits?\b|allowance|insufficient[\s_-]*(funds|balance)|exhausted|upgrade/i;

export function classifyProviderError(status: number, text: string): ProviderErrorKind {
  if (status === 402) return 'quota';
  if (status === 429) return QUOTA_PATTERN.test(text) ? 'quota' : 'rate_limited';
  if (status === 401 || status === 403) return QUOTA_PATTERN.test(text) ? 'quota' : 'auth';
  if (status === 408 || status >= 500) return 'unavailable';
  return 'rejected';
}

/** What the user sees for each provider failure, and the HTTP status the route answers with. */
export const PROVIDER_ERRORS: Record<ProviderErrorKind, { status: number; message: string }> = {
  quota: {
    status: 402,
    message:
      "Your lead data provider's allowance is used up, so Lead Finder can't search or pull leads right now. No credits were used. Please contact support to top it up.",
  },
  rate_limited: {
    status: 429,
    message:
      'The lead data provider is limiting requests right now. Please try again in a minute. No credits were used.',
  },
  auth: {
    status: 502,
    message:
      "Lead Finder couldn't connect to the lead data provider because of an API key or account problem. Please contact support. No credits were used.",
  },
  unavailable: {
    status: 503,
    message:
      'The lead data provider is temporarily unavailable. Please try again in a few minutes. No credits were used.',
  },
  rejected: {
    status: 400,
    message:
      "The lead data provider couldn't run that search. Try simpler filters, and contact support if it keeps happening. No credits were used.",
  },
};

/** Honest note for a pull the provider stopped part-way; the rows already enriched are kept. */
export function partialPullNotice(kind: ProviderErrorKind, got: number, requested: number): string {
  const why: Record<ProviderErrorKind, string> = {
    quota: "the lead data provider's allowance ran out",
    rate_limited: 'the lead data provider started limiting requests',
    auth: 'the lead data provider stopped accepting our API key',
    unavailable: 'the lead data provider stopped responding',
    rejected: 'the lead data provider refused the next page',
  };
  const next: Record<ProviderErrorKind, string> = {
    quota: 'Please contact support to top up the data allowance before pulling more.',
    rate_limited: 'Run another pull in a minute for the rest.',
    auth: 'Please contact support.',
    unavailable: 'Try another pull in a few minutes for the rest.',
    rejected: 'Try another pull for the rest.',
  };
  const n = got.toLocaleString('en-US');
  return `Pulled ${n} of the ${requested.toLocaleString('en-US')} leads you asked for: ${why[kind]} part-way. Only these ${n} count against your workspace's records. ${next[kind]}`;
}

/** Industry & headcount mix of rows actually returned (shares only; counts are never extrapolated). */
export function rowBreakdowns(rows: { industry: string; headcount: string }[]) {
  const industryCounts: Record<string, number> = {};
  const headcountCounts: Record<string, number> = {};
  for (const p of rows) {
    const ind = p.industry || 'Unknown';
    const hc = p.headcount || 'Unknown';
    industryCounts[ind] = (industryCounts[ind] || 0) + 1;
    headcountCounts[hc] = (headcountCounts[hc] || 0) + 1;
  }
  const denom = Math.max(1, rows.length);
  const toBreakdown = (counts: Record<string, number>) =>
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, cnt]) => ({ label, count: null, pct: Math.round((cnt / denom) * 100) }));
  return { byIndustry: toBreakdown(industryCounts), byHeadcount: toBreakdown(headcountCounts) };
}
