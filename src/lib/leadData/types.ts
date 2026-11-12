/**
 * Lead Finder request/response types and filter options, shared by POST /api/intelligence/icp,
 * the server-side data provider modules (lib/server/leadData/*) and the Lead Finder UI.
 * Client-safe: no server imports.
 */

/** Which lead data provider answers Lead Finder (chosen on the server, never by the browser). */
export type LeadDataProviderId = 'getleads' | 'leadocean';

/** Lead Finder filters as the UI sends them. Each provider maps what it supports. */
export interface IcpFilters {
  titles?: string;
  excludeTitles?: string;
  seniority?: string[];
  department?: string;
  industry?: string;
  headcountRange?: string;
  country?: string;
  state?: string;
  city?: string;
  technologies?: string;
  companyKeywords?: string;
  requirePhone?: boolean;
  requireVerifiedEmail?: boolean;
  excludePreviouslyPulled?: boolean;
  // Extra filters, only offered (and only applied) when the active provider supports them.
  /** Company revenue bands, values from REVENUE_BAND_OPTIONS. */
  revenue?: string[];
  /** Last funding round, keys from FUNDING_STAGE_OPTIONS. */
  fundingStages?: string[];
  /** Started the current role in the last N months (3, 6 or 12). */
  newInRoleMonths?: number;
  /** Keyword in the person's LinkedIn About / bio. */
  personKeywords?: string;
  /** Only people with a direct-dial phone number. */
  requireDirectDial?: boolean;
  /** Only people showing LinkedIn's Hiring badge. */
  isHiring?: boolean;
}

export interface IcpSearchRequestPayload {
  mode: 'size' | 'pull' | 'enrich_url';
  tenantCode: string;
  /** Pull only: stream progress as NDJSON (see IcpPullStreamEvent) instead of one JSON response. */
  stream?: boolean;
  pullCount?: number;
  /** Pull only: the workspace's available lead balance; the server never pulls more than this. */
  maxRecords?: number;
  cursor?: string; // LeadOcean pagination cursor for 25-per-page navigation
  /**
   * Pull only, offset-paged providers (GetLeads): where to start in the result list. The browser
   * sends the `nextOffset` of its previous pull with the same filters when "skip leads this
   * workspace already pulled" is on, so a repeat pull continues instead of buying the same people.
   */
  offset?: number;
  linkedinUrlToEnrich?: string;
  /** LeadOcean only (Super Admin testing). Never used for GetLeads: its key stays on the server. */
  masterKeyOverride?: string;
  filters: IcpFilters;
}

export interface SanitizedIcpProspect {
  id: string; // Always prefixed with APLY-
  name: string;
  company: string;
  title: string;
  seniority: string;
  department: string;
  email: string;
  emailVerified: boolean;
  phone: string;
  hasDirectPhone: boolean;
  headcount: string;
  industry: string;
  location: string;
  website: string;             // Accurate company website (https://domain.com)
  companyDomain: string;       // Raw domain (domain.com)
  linkedinUrl: string;         // Accurate personal LinkedIn URL (https://www.linkedin.com/in/...)
  companyLinkedinUrl?: string; // Accurate company LinkedIn URL (https://www.linkedin.com/company/...)
  technologies: string[];
}

/** Live progress of a pull, emitted while the server searches and enriches. */
export type IcpPullProgressEvent =
  | { type: 'stage'; stage: 'searching' }
  /**
   * After each provider search page. `count` is the running total of rows found for this pull,
   * `planned` how many it expects to enrich overall (exact once `complete`), `totalMatching` the
   * provider's own market size or null when it gave none.
   */
  | { type: 'found'; count: number; totalMatching: number | null; planned: number; complete: boolean; batch: number }
  | {
      type: 'enriched';
      done: number;
      total: number;
      withEmail: number;
      withPhone: number;
      /** The row just enriched (the workspace's own pulled data), for the panel's "Latest enriched" feed. */
      lastLead: IcpPullLastLead;
    };

/** Company, title and reachability of the most recently enriched row of a streamed pull. */
export interface IcpPullLastLead {
  company: string;
  title: string;
  hasEmail: boolean;
  hasPhone: boolean;
}

/**
 * One line of the NDJSON stream returned for `{ mode: 'pull', stream: true }`. The last line is
 * always `result` (the exact body the JSON path returns, plus `type`) or `error` (the JSON path's
 * `error` message and the HTTP status it would have used).
 */
export type IcpPullStreamEvent =
  | IcpPullProgressEvent
  | ({ type: 'result' } & Record<string, unknown>)
  | { type: 'error'; error: string; status: number };

/** Company revenue bands (GetLeads' exact labels). */
export const REVENUE_BAND_OPTIONS = [
  '<$1M',
  '$1M to <$10M',
  '$10M to <$50M',
  '$50M to <$100M',
  '$100M to <$1B',
  '$1B+',
] as const;

/** Last funding round, grouped for the UI; the server expands each key to the provider's values. */
export const FUNDING_STAGE_OPTIONS = [
  { key: 'pre_seed', label: 'Pre-seed / angel' },
  { key: 'seed', label: 'Seed' },
  { key: 'series_a', label: 'Series A' },
  { key: 'series_b', label: 'Series B' },
  { key: 'series_c_plus', label: 'Series C+' },
  { key: 'private_equity', label: 'Private equity' },
  { key: 'ipo', label: 'IPO / public' },
] as const;

export const NEW_IN_ROLE_OPTIONS = [
  { months: 3, label: 'Started in the last 3 months' },
  { months: 6, label: 'Started in the last 6 months' },
  { months: 12, label: 'Started in the last 12 months' },
] as const;
