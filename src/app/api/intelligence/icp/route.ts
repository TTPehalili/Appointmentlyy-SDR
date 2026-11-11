import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/server/session';

/**
 * Appointmentlyy ICP Data Cloud — Stealth Server-Side Proxy Gateway
 *
 * Route: POST /api/intelligence/icp
 *
 * Connects to https://api.leadocean.io using the master API key:
 * - POST /v1/people/search?count=true (Audience sizing & search)
 * - POST /v1/enrich (Full contact reveal: verified work email, direct/mobile phones,
 *   company website domain, and accurate personal & company LinkedIn URLs)
 * - POST /v1/people/viewed (Per-tenant de-duplication via viewedSet)
 */

const DEFAULT_UPSTREAM_BASE_URL = 'https://api.leadocean.io';

let warnedTestBaseUrl = false;
let warnedTestBaseUrlIgnored = false;

/**
 * Provider base URL. Tests can point it at a local mock with LEAD_DATA_TEST_BASE_URL, but only
 * outside production builds, or in a production build started locally with LEAD_DATA_TEST_MODE=1.
 * It is never honoured on Railway (live clients), whatever else is set.
 */
function resolveUpstreamBaseUrl(): string {
  const override = (process.env.LEAD_DATA_TEST_BASE_URL || '').trim();
  if (!override) return DEFAULT_UPSTREAM_BASE_URL;
  const onRailway = Boolean(
    process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID
  );
  const allowed =
    !onRailway && (process.env.NODE_ENV !== 'production' || process.env.LEAD_DATA_TEST_MODE === '1');
  if (!allowed) {
    if (!warnedTestBaseUrlIgnored) {
      warnedTestBaseUrlIgnored = true;
      console.warn('[Appointmentlyy Data Cloud] LEAD_DATA_TEST_BASE_URL is set but ignored in this environment.');
    }
    return DEFAULT_UPSTREAM_BASE_URL;
  }
  if (!warnedTestBaseUrl) {
    warnedTestBaseUrl = true;
    console.warn(
      `\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n` +
        `[Appointmentlyy Data Cloud] TEST MODE: lead data provider calls go to ${override}\n` +
        `instead of ${DEFAULT_UPSTREAM_BASE_URL}. Never run like this for real clients.\n` +
        `!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`
    );
  }
  return override.replace(/\/+$/, '');
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
  linkedinUrlToEnrich?: string;
  masterKeyOverride?: string;
  filters: {
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
  };
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

function resolveUpstreamApiKey(overrideKey?: string): string {
  if (overrideKey && overrideKey.trim().length > 10) {
    return overrideKey.trim();
  }
  return (
    process.env.APLY_DATA_ENGINE_KEY ||
    process.env.LEADOCEAN_API_KEY ||
    ''
  ).trim();
}

/**
 * Convert country name(s) or comma-separated codes to strict 2-character ISO codes required by LeadOcean
 */
function normalizeCountryToIso2(input?: string): string[] {
  if (!input || !input.trim()) return ['US', 'PH', 'AU', 'GB', 'CA'];
  const parts = input
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const map: Record<string, string> = {
    'UNITED STATES': 'US',
    'USA': 'US',
    'U.S.A.': 'US',
    'AMERICA': 'US',
    'AUSTRALIA': 'AU',
    'UNITED KINGDOM': 'GB',
    'UK': 'GB',
    'GREAT BRITAIN': 'GB',
    'ENGLAND': 'GB',
    'CANADA': 'CA',
    'PHILIPPINES': 'PH',
    'SINGAPORE': 'SG',
    'NEW ZEALAND': 'NZ',
    'GERMANY': 'DE',
    'FRANCE': 'FR',
    'NETHERLANDS': 'NL',
    'IRELAND': 'IE',
    'UNITED ARAB EMIRATES': 'AE',
    'UAE': 'AE',
    'INDIA': 'IN',
    'GLOBAL': 'GLOBAL',
  };

  const out: string[] = [];
  for (const p of parts) {
    if (p === 'GLOBAL') {
      return ['US', 'PH', 'AU', 'GB', 'CA'];
    }
    if (p.length === 2) {
      out.push(p);
    } else if (map[p]) {
      out.push(map[p]);
    }
  }
  return out.length > 0 ? Array.from(new Set(out)) : ['US', 'PH', 'AU', 'GB', 'CA'];
}

/**
 * Convert UI seniority labels to LeadOcean's exact enum values:
 * ['owner', 'founder', 'c_suite', 'partner', 'vp', 'head', 'director', 'manager', 'senior', 'entry', 'intern', 'unknown']
 */
function normalizeSeniorityEnum(list?: string[]): string[] {
  if (!list || list.length === 0) return ['c_suite', 'vp', 'director', 'owner'];
  const out = new Set<string>();
  for (const item of list) {
    const s = item.toLowerCase();
    if (s.includes('c-suite') || s.includes('c_suite') || s.includes('chief')) {
      out.add('c_suite');
    } else if (s.includes('owner') || s.includes('founder')) {
      out.add('owner');
      out.add('founder');
    } else if (s.includes('partner')) {
      out.add('partner');
    } else if (s.includes('vp') || s.includes('vice')) {
      out.add('vp');
    } else if (s.includes('director') || s.includes('head')) {
      out.add('director');
      out.add('head');
    } else if (s.includes('manager')) {
      out.add('manager');
    }
  }
  return out.size > 0 ? Array.from(out) : ['c_suite', 'vp', 'director', 'owner'];
}

/**
 * Convert UI headcount string (e.g. "11-50 employees") to LeadOcean's exact `employee_range` enum:
 * ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"]
 */
function normalizeEmployeeRangeEnum(hc?: string): string[] | undefined {
  if (!hc || !hc.trim()) return undefined;
  const clean = hc
    .replace(/employees/gi, '')
    .replace(/seats/gi, '')
    .replace(/,/g, '')
    .trim();

  const valid = [
    '1-10',
    '11-50',
    '51-200',
    '201-500',
    '501-1000',
    '1001-5000',
    '5001-10000',
    '10001+',
  ];
  if (valid.includes(clean)) return [clean];
  if (clean === '1000+') return ['1001-5000', '5001-10000', '10001+'];
  return undefined;
}

const OA_DIRECTORY_BPO_DOMAINS = [
  'outsourceaccelerator.com',
  'cloudstaff.com',
  'boothandpartners.com',
  'shoreagents.com',
  'outsourced.ph',
  'bruntwork.co',
  'multiplymii.com',
  'wingassistant.com',
  'athena.com',
  'cyberbacker.com',
  'microsourcing.com',
  'kmc.solutions',
  'remotestaff.com.au',
  'flatplanet.com.au',
  'emsoutsource.com',
  'stealthagents.com',
  'virtudesk.com',
  'myoutdesk.com',
  'boldr.com',
  'boldrimpact.com',
  'supportninja.com',
  'taskus.com',
  'acquirebpo.com',
  'staffdomain.com',
  'satelliteoffice.com',
  'offshoremvp.com',
  'kineticstaff.com',
  'hammerjack.com.au',
  'somewhere.com',
  'emapta.com',
  'concentrix.com',
  'foundever.com',
  'teleperformance.com',
  'alorica.com',
  ' Sutherlandglobal.com',
  'probe-group.com',
  'probecx.com',
  'connectos.co',
  'penbrothers.com',
  'filtaglobal.com',
  'diversifyoss.com',
  'eastvantage.com',
  'fullscale.io',
  'coopsys.com',
  'superstaff.com',
  'infinit-o.com',
  'magellan-solutions.com',
  'piton-global.com',
  'openaccessbpo.com',
  'helpware.com',
  '247-inc.com',
  'startek.com',
  'vxi.com',
  'ibex.co',
  'tdcx.com',
  'everise.com',
  'connext.solutions',
  'connextglobal.com',
  'beepo.com.au',
  'teamglobal.com.au',
  'offshorly.com',
  'scalableos.com',
  'smartoutsourcing.co.uk',
  'deployed.co',
  'kamelbpo.com',
  'selectvoicecom.com',
  'philippinecompanies.com',
  'virtuallyincredible.com',
  'outsourcey.com',
  'ClearSourceBPO.com',
  'optimbpo.com',
  'personiv.com',
  ' Hugoinc.com',
  'intelepeer.com',
].map((d) => d.trim().toLowerCase());

function buildUpstreamFilterObject(
  filters: IcpSearchRequestPayload['filters'],
  tenantCode: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const indLower = (filters.industry || '').toLowerCase();
  const kwLower = (filters.companyKeywords || '').toLowerCase();
  const isOaBpoDirectory =
    indLower.includes('outsource accelerator') ||
    kwLower.includes('outsourceaccelerator.com') ||
    indLower.includes('bpo & virtual assistant');

  if (isOaBpoDirectory) {
    payload.domain = OA_DIRECTORY_BPO_DOMAINS.slice(0, 50);
    payload.seniority = normalizeSeniorityEnum(filters.seniority);
  } else {
    if (filters.titles?.trim()) {
      payload.title = filters.titles
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (filters.excludeTitles?.trim()) {
      payload.excludeTitle = filters.excludeTitles
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (filters.seniority && filters.seniority.length > 0) {
      payload.seniority = normalizeSeniorityEnum(filters.seniority);
    }

    const empRange = normalizeEmployeeRangeEnum(filters.headcountRange);
    if (empRange) {
      payload.employeeRange = empRange;
    }

    payload.country = normalizeCountryToIso2(filters.country);

    if (filters.city?.trim()) {
      payload.city = filters.city
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // Check if companyKeywords has domain names (e.g. "cloudstaff.com, taskus.com")
    const customDomains = (filters.companyKeywords || '')
      .split(',')
      .map((s) =>
        s
          .trim()
          .replace(/^https?:\/\//i, '')
          .replace(/^www\./i, '')
          .replace(/\/.*$/, '')
          .toLowerCase()
      )
      .filter((s) => s.includes('.') && !s.includes(' '));

    if (customDomains.length > 0) {
      payload.domain = customDomains;
    } else if (filters.industry?.trim()) {
      const ind = filters.industry.trim();
      if (ind.toLowerCase().includes('hvac')) {
        payload.q = 'HVAC';
      } else if (
        ind.toLowerCase().includes('bpo') ||
        ind.toLowerCase().includes('outsourc') ||
        ind.toLowerCase().includes('virtual assistant')
      ) {
        payload.q = 'Outsourcing';
      } else if (ind.toLowerCase().includes('solar') || ind.toLowerCase().includes('renew')) {
        payload.q = 'Solar Energy';
      } else if (ind.toLowerCase().includes('saas') || ind.toLowerCase().includes('software')) {
        payload.q = 'Software SaaS';
      } else {
        payload.q = ind.split('&')[0].trim();
      }
    }
  }

  if (filters.requirePhone !== false) {
    payload.hasPhone = true;
  }
  if (filters.requireVerifiedEmail !== false) {
    payload.hasEmail = true;
  }
  if (filters.excludePreviouslyPulled !== false) {
    payload.excludeViewed = true;
    payload.viewedSet = `tenant_${(tenantCode || 'DEFAULT').toUpperCase()}`;
  }

  return payload;
}

/** Registrable part of a domain: taskus.com, rsm.com.au, kmc.solutions. */
function registrableDomain(domain: string): string {
  const parts = domain.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  const secondLevel = ['co', 'com', 'org', 'net', 'gov', 'ac', 'edu'];
  if (parts.length >= 3 && secondLevel.includes(parts[parts.length - 2]) && parts[parts.length - 1].length === 2) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/** True when an email domain belongs to the company's website domain (taskus.ph vs taskus.com counts). */
function sameOrganisationDomain(emailDomain: string, companyDomain: string): boolean {
  if (!emailDomain || !companyDomain) return false;
  const a = registrableDomain(emailDomain);
  const b = registrableDomain(companyDomain);
  return a === b || a.split('.')[0] === b.split('.')[0];
}

/**
 * Parse a `leadocean.person.v1` record from `/v1/people/search` or `/v1/enrich`
 * into our sanitized Appointmentlyy schema with accurate LinkedIn URL & Company Website.
 */
function parseLeadOceanRecord(
  row: Record<string, any>,
  enrichData: Record<string, any> | null,
  revealContact: boolean,
  index: number
): SanitizedIcpProspect {
  const merged = enrichData || row;
  const profile = merged.profile_data || row.profile_data || {};
  const contactData = merged.contact_data || row.contact_data || {};
  const experiences: Record<string, any>[] = Array.isArray(
    contactData.contact_current_experiences
  )
    ? contactData.contact_current_experiences
    : Array.isArray(row.contact_data?.contact_current_experiences)
    ? row.contact_data.contact_current_experiences
    : [];
  const exp = experiences[0] || {};

  const rawPersonId =
    row.meta?.source_ids?.person_id ||
    profile.profile_id ||
    `${Date.now()}_${index}`;
  const cleanId = `APLY-${String(rawPersonId)
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-9)
    .toUpperCase()}`;

  const fullName =
    profile.profile_full_name ||
    [profile.profile_first_name, profile.profile_last_name]
      .filter(Boolean)
      .join(' ') ||
    'Decision Maker';

  // Accurate Personal LinkedIn URL from LeadOcean
  const personalLinkedinUrl =
    profile.profile_url ||
    row.profile_data?.profile_url ||
    (typeof row.meta?.key === 'string' && row.meta.key.includes('linkedin.com')
      ? row.meta.key
      : '');

  // Accurate Company Website & Company LinkedIn URL from LeadOcean
  const companyName = exp.company_name || 'Enterprise Account';
  const rawDomain = (exp.company_domain || '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim();
  const companyWebsite = rawDomain ? `https://${rawDomain}` : '';
  const companyLinkedinUrl =
    exp.company_social_links?.linkedin?.url || undefined;

  // Missing fields stay empty. They are never copied from the search filters or filled with a
  // plausible default: a lead list must only hold what the provider actually returned.
  const jobTitle: string = exp.job_title || '';
  const seniority: string = exp.job_seniority?.job_level || '';
  const department: string = exp.job_functions?.[0]?.level1?.name || '';

  const empCount = exp.company_employees?.number_of_employees;
  const empCode = exp.company_employees?.number_of_employees_code;
  const headcountStr: string = empCount
    ? `${Number(empCount).toLocaleString()} (${empCode || 'employees'})`
    : empCode || '';

  const industryStr: string = exp.company_industry || exp.company_industries?.[0]?.name3 || '';

  const addr = profile.profile_address || row.profile_data?.profile_address || {};
  const locationStr = [addr.city, addr.state, addr.country_code || addr.country].filter(Boolean).join(', ');

  // Extract best verified work email & direct/mobile phone from /v1/enrich
  const emailsList: Record<string, any>[] = Array.isArray(
    contactData.contact_emails
  )
    ? contactData.contact_emails
    : [];
  // Only a work email LeadOcean has VERIFIED at the person's CURRENT employer counts. LeadOcean also
  // returns past-employer, personal, catch-all and untested addresses; showing those as "verified"
  // put stale emails (e.g. a TaskUs lead with a Concentrix address) in front of reps.
  const bestVerifiedEmailObj = emailsList.find(
    (e) =>
      e.status === 'verified' &&
      typeof e.email === 'string' &&
      e.type !== 'personal' &&
      sameOrganisationDomain(e.email.split('@')[1] || '', rawDomain)
  );

  const phonesList: Record<string, any>[] = Array.isArray(
    contactData.contact_phones
  )
    ? contactData.contact_phones
    : [];
  const bestPhoneObj =
    phonesList.find((p) => p.type === 'mobile') ||
    phonesList.find((p) => p.type === 'office' || p.ddi) ||
    phonesList[0];

  // Never invent contact details: an empty value is honest, a guessed address or placeholder number
  // wastes reps' dials and sends.
  const unlockedEmail: string = bestVerifiedEmailObj?.email || '';
  const unlockedPhone: string = bestPhoneObj?.phone || '';

  const maskedDomain = rawDomain || 'company.com';
  const firstInitial = (profile.profile_first_name || fullName || 'c')[0].toLowerCase();

  return {
    id: cleanId,
    name: fullName,
    company: companyName,
    title: jobTitle,
    seniority,
    department,
    email: revealContact ? unlockedEmail : unlockedEmail ? `${firstInitial}•••@${maskedDomain}` : '',
    emailVerified: Boolean(bestVerifiedEmailObj),
    phone: revealContact ? unlockedPhone : unlockedPhone ? '+1 (•••) •••-••84' : '',
    hasDirectPhone: Boolean(bestPhoneObj?.phone),
    headcount: headcountStr,
    industry: industryStr,
    location: locationStr,
    website: companyWebsite,
    companyDomain: rawDomain,
    linkedinUrl: personalLinkedinUrl,
    companyLinkedinUrl,
    // The provider does not return a technology list per person; the filter is not evidence of one.
    technologies: [],
  };
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

interface IcpRouteResult {
  status: number;
  body: Record<string, unknown>;
}

const SYNCING_ERROR_MESSAGE =
  'Appointmentlyy Data Cloud is syncing high-volume clusters. Please retry in a moment.';

/** At most ~10 `enriched` events a second (the last row is always reported). */
const ENRICH_PROGRESS_MIN_INTERVAL_MS = 100;

/** A raw provider record (leadocean.person.v1); parsed field by field in parseLeadOceanRecord. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProviderRow = Record<string, any>;

/** Rows per provider search (the provider's page limit). A pull runs as many pages as it needs. */
const PROVIDER_PAGE_SIZE = 100;
/** Most leads one pull request brings in (the largest pull size Lead Finder offers). */
const MAX_PULL_PER_REQUEST = 1000;
/** Rows per free preview page. */
const PREVIEW_PAGE_SIZE = 25;

/** Why the lead data provider refused a call. Only an empty 200 means "no matching profiles". */
type ProviderErrorKind = 'quota' | 'rate_limited' | 'auth' | 'unavailable' | 'rejected';

const QUOTA_PATTERN = /fair[\s_-]*usage|quota|credits?\b|allowance|insufficient[\s_-]*(funds|balance)|exhausted|upgrade/i;

function classifyProviderError(status: number, text: string): ProviderErrorKind {
  if (status === 402) return 'quota';
  if (status === 429) return QUOTA_PATTERN.test(text) ? 'quota' : 'rate_limited';
  if (status === 401 || status === 403) return QUOTA_PATTERN.test(text) ? 'quota' : 'auth';
  if (status === 408 || status >= 500) return 'unavailable';
  return 'rejected';
}

/** What the user sees for each provider failure, and the HTTP status the route answers with. */
const PROVIDER_ERRORS: Record<ProviderErrorKind, { status: number; message: string }> = {
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
function partialPullNotice(kind: ProviderErrorKind, got: number, requested: number): string {
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

/**
 * The whole search / pull / single-enrich implementation, shared by the JSON response and the
 * NDJSON stream. `onProgress` is only called for pulls, and only when the caller streams.
 */
async function runIcpRequest(
  body: IcpSearchRequestPayload,
  tenantCode: string,
  onProgress?: (event: IcpPullProgressEvent) => void
): Promise<IcpRouteResult> {
  try {
    const {
      mode = 'size',
      pullCount = 25,
      cursor,
      linkedinUrlToEnrich,
      masterKeyOverride,
      filters = {},
    } = body;

    const apiKey = resolveUpstreamApiKey(masterKeyOverride);
    const UPSTREAM_BASE_URL = resolveUpstreamBaseUrl();

    // =========================================================================
    // MODE A: Direct Single LinkedIn URL Enrich (POST /v1/enrich)
    // Matches: curl -X POST https://api.leadocean.io/v1/enrich -d '{"linkedin_url":"..."}'
    // =========================================================================
    if (mode === 'enrich_url' && linkedinUrlToEnrich?.trim()) {
      const cleanUrl = linkedinUrlToEnrich.trim();
      const enrichRes = await fetch(`${UPSTREAM_BASE_URL}/v1/enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          linkedin_url: cleanUrl,
          reveal_email: true,
        }),
      });

      const enrichJson = await enrichRes.json();
      if (!enrichRes.ok || !enrichJson.success || !enrichJson.data) {
        return {
          status: 400,
          body: {
            error:
              enrichJson?.error?.message ||
              'Could not enrich that LinkedIn profile URL. Ensure it is a valid https://www.linkedin.com/in/... URL.',
          },
        };
      }

      const prospect = parseLeadOceanRecord(
        enrichJson.data,
        enrichJson.data,
        true,
        0
      );

      return {
        status: 200,
        body: {
          success: true,
          engine: 'Appointmentlyy Data Cloud v2.4',
          mode: 'enrich_url',
          prospect,
        },
      };
    }

    // =========================================================================
    // MODE B: Search & Market Sizing ('size') OR Pull & Enrich ('pull')
    //
    // A pull pages through the provider with its cursor, PROVIDER_PAGE_SIZE rows per search, until
    // it has the requested count (at most MAX_PULL_PER_REQUEST, and never more than the workspace's
    // available balance the browser sends as `maxRecords`). Each page is enriched before the next
    // search. If the provider stops part-way (allowance used up, rate limit, key problem, outage),
    // the rows already enriched are returned with an honest `notice`.
    // =========================================================================
    const isPull = mode === 'pull';
    const requestedCount = Math.max(1, Math.floor(Number(pullCount)) || 25);
    const balanceCap =
      typeof body.maxRecords === 'number' && Number.isFinite(body.maxRecords)
        ? Math.max(0, Math.floor(body.maxRecords))
        : Infinity;
    if (isPull && balanceCap < 1) {
      return {
        status: 402,
        body: { error: 'Your workspace has no lead records available right now. Top up your quota to add records.' },
      };
    }
    const target = isPull
      ? Math.min(requestedCount, MAX_PULL_PER_REQUEST, balanceCap)
      : mode === 'size'
      ? PREVIEW_PAGE_SIZE
      : Math.min(requestedCount, PROVIDER_PAGE_SIZE);
    const upstreamFilter = buildUpstreamFilterObject(filters, tenantCode);

    const reportProgress = isPull ? onProgress : undefined;
    reportProgress?.({ type: 'stage', stage: 'searching' });

    const searchPage = async (
      limit: number,
      pageCursor: string | null
    ): Promise<
      | { ok: true; rows: ProviderRow[]; nextCursor: string | null; total: number | null }
      | { ok: false; kind: ProviderErrorKind }
    > => {
      const searchPayload: Record<string, unknown> = { ...upstreamFilter, limit };
      if (pageCursor) searchPayload.cursor = pageCursor;
      let searchRes: Response;
      try {
        searchRes = await fetch(`${UPSTREAM_BASE_URL}/v1/people/search?count=true`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify(searchPayload),
        });
      } catch (err: unknown) {
        console.warn('[Appointmentlyy Data Cloud] Upstream search failed:', err);
        return { ok: false, kind: 'unavailable' };
      }
      if (!searchRes.ok) {
        const errText = await searchRes.text().catch(() => '');
        console.warn('[Appointmentlyy Data Cloud] Upstream search non-200:', searchRes.status, errText);
        return { ok: false, kind: classifyProviderError(searchRes.status, errText) };
      }
      const searchJson = await searchRes.json();
      const rows: ProviderRow[] = Array.isArray(searchJson.data) ? searchJson.data : [];
      const rawNext = searchJson.meta?.nextCursor;
      const rawTotal = searchJson.meta?.total;
      return {
        ok: true,
        rows,
        nextCursor: typeof rawNext === 'string' && rawNext ? rawNext : null,
        // Only the provider's own count. A missing or inconsistent total is unknown (null), never estimated.
        total:
          typeof rawTotal === 'number' && Number.isFinite(rawTotal) && rawTotal >= rows.length ? rawTotal : null,
      };
    };

    const startCursor = cursor && cursor.trim() ? cursor.trim() : null;
    let pageCursor: string | null = startCursor;
    let nextCursor: string | null = null;
    let totalMatching: number | null = null;
    let stoppedBy: ProviderErrorKind | null = null;
    let found = 0;
    let batches = 0;
    const maxBatches = Math.ceil(target / PROVIDER_PAGE_SIZE) + 3; // guards a provider that repeats pages
    const seenKeys = new Set<string>();
    const viewedIds: string[] = [];
    const sanitizedProspects: SanitizedIcpProspect[] = [];
    let withEmail = 0;
    let withPhone = 0;
    let lastProgressAt = 0;

    pages: for (;;) {
      const limit = isPull ? Math.min(PROVIDER_PAGE_SIZE, target - found) : target;
      const page = await searchPage(limit, pageCursor);
      batches++;
      if (!page.ok) {
        if (sanitizedProspects.length === 0) {
          const err = PROVIDER_ERRORS[page.kind];
          return { status: err.status, body: { error: err.message, reason: page.kind } };
        }
        stoppedBy = page.kind;
        break;
      }

      if (batches === 1) {
        totalMatching = page.total ?? (page.rows.length === 0 && !startCursor ? 0 : null);
      }
      nextCursor = page.nextCursor;

      // A pull never keeps the same person twice, even if the provider repeats one across pages.
      const rows: ProviderRow[] = [];
      for (const row of page.rows) {
        if (isPull && rows.length >= limit) break;
        const key = String(row.meta?.source_ids?.person_id || row.profile_data?.profile_url || row.meta?.key || '');
        if (isPull && key) {
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
        }
        rows.push(row);
      }
      found += rows.length;

      const searchComplete =
        !isPull || found >= target || !page.nextCursor || page.rows.length === 0 || batches >= maxBatches;
      // How many rows this pull expects to enrich in total: exact once the search is complete.
      const planned = searchComplete
        ? found
        : Math.max(found, totalMatching !== null ? Math.min(target, totalMatching) : target);
      reportProgress?.({ type: 'found', count: found, totalMatching, planned, complete: searchComplete, batch: batches });

      // If mode === 'pull', enrich the rows via POST /v1/enrich using linkedin_url to unlock verified emails & phones
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rawPersonId = row.meta?.source_ids?.person_id;
        const rawLinkedinUrl = row.profile_data?.profile_url || row.meta?.key;

        let enrichedRecord: ProviderRow | null = null;

        if (isPull && (rawLinkedinUrl || rawPersonId)) {
          try {
            const enrichPayload: Record<string, unknown> = {
              reveal_email: true,
            };
            if (rawLinkedinUrl) {
              enrichPayload.linkedin_url = String(rawLinkedinUrl);
            }
            if (rawPersonId) {
              enrichPayload.person_id = String(rawPersonId);
            }

            const enrichRes = await fetch(`${UPSTREAM_BASE_URL}/v1/enrich`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
              },
              body: JSON.stringify(enrichPayload),
            });

            if (enrichRes.ok) {
              const enrichJson = await enrichRes.json();
              if (enrichJson.success && enrichJson.data) {
                enrichedRecord = enrichJson.data;
              }
            } else {
              // Allowance used up, rate limited or key refused: every further call fails the same way,
              // so stop here rather than saving (and charging for) rows without contact details.
              // Other failures (one person not found, a blip) keep the row with its search data.
              const errText = await enrichRes.text().catch(() => '');
              const kind = classifyProviderError(enrichRes.status, errText);
              if (kind === 'quota' || kind === 'rate_limited' || kind === 'auth') {
                console.warn('[Appointmentlyy Data Cloud] Upstream enrich stopped the pull:', enrichRes.status, errText);
                stoppedBy = kind;
                break pages;
              }
            }
          } catch {
            // Continue with search row data
          }

          if (rawPersonId) {
            viewedIds.push(String(rawPersonId));
          }
        }

        const prospect = parseLeadOceanRecord(row, enrichedRecord, isPull, sanitizedProspects.length);
        sanitizedProspects.push(prospect);

        if (reportProgress) {
          // Counts come from the parsed rows themselves: only verified current-employer emails and
          // real phone numbers survive parseLeadOceanRecord, so these are the numbers the rep gets.
          if (prospect.email) withEmail++;
          if (prospect.phone) withPhone++;
          const now = Date.now();
          const isLast = i === rows.length - 1;
          if (isLast || now - lastProgressAt >= ENRICH_PROGRESS_MIN_INTERVAL_MS) {
            lastProgressAt = now;
            reportProgress({
              type: 'enriched',
              done: sanitizedProspects.length,
              total: planned,
              withEmail,
              withPhone,
              lastLead: {
                // parseLeadOceanRecord fills a missing company with a placeholder; never show it as a real name.
                company: prospect.company === 'Enterprise Account' ? '' : prospect.company || '',
                title: prospect.title || '',
                hasEmail: Boolean(prospect.email),
                hasPhone: Boolean(prospect.phone),
              },
            });
          }
        }
      }

      if (searchComplete) break;
      pageCursor = page.nextCursor;
    }

    if (stoppedBy && sanitizedProspects.length === 0) {
      const err = PROVIDER_ERRORS[stoppedBy];
      return { status: err.status, body: { error: err.message, reason: stoppedBy } };
    }

    // Mark pulled records in per-tenant viewedSet so this client never pulls duplicates
    if (isPull && viewedIds.length > 0) {
      fetch(`${UPSTREAM_BASE_URL}/v1/people/viewed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          ids: viewedIds,
          set: `tenant_${tenantCode.toUpperCase()}`,
        }),
      }).catch(() => {});
    }

    // Industry & headcount mix of the rows actually returned. `count` scales the share to the
    // provider's total and is null when the provider gave no total.
    const industryCounts: Record<string, number> = {};
    const headcountCounts: Record<string, number> = {};
    for (const p of sanitizedProspects) {
      const ind = p.industry || 'Unknown';
      const hc = p.headcount || 'Unknown';
      industryCounts[ind] = (industryCounts[ind] || 0) + 1;
      headcountCounts[hc] = (headcountCounts[hc] || 0) + 1;
    }

    const denom = Math.max(1, sanitizedProspects.length);
    const toBreakdown = (counts: Record<string, number>) =>
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, cnt]) => ({
          label,
          count: totalMatching !== null ? Math.round((cnt / denom) * totalMatching) : null,
          pct: Math.round((cnt / denom) * 100),
        }));

    return {
      status: 200,
      body: {
        success: true,
        engine: 'Appointmentlyy Data Cloud v2.4',
        mode,
        totalMatching,
        returnedCount: sanitizedProspects.length,
        nextCursor,
        prospects: sanitizedProspects,
        breakdowns: {
          byIndustry: toBreakdown(industryCounts),
          byHeadcount: toBreakdown(headcountCounts),
        },
        ...(isPull
          ? {
              requestedCount: target,
              batches,
              ...(stoppedBy
                ? {
                    stoppedReason: stoppedBy,
                    notice: partialPullNotice(stoppedBy, sanitizedProspects.length, target),
                  }
                : {}),
            }
          : {}),
      },
    };
  } catch (err: unknown) {
    console.error('[Appointmentlyy Data Cloud Error]:', err);
    return { status: 500, body: { error: SYNCING_ERROR_MESSAGE } };
  }
}

/**
 * NDJSON stream for a pull: one JSON object per line, flushed as each event happens.
 * The work is the same runIcpRequest call the JSON path makes.
 */
function streamIcpPull(body: IcpSearchRequestPayload, tenantCode: string): Response {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: IcpPullStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The client went away; the pull still finishes, exactly like the JSON path.
          closed = true;
        }
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed or cancelled.
        }
      };

      void (async () => {
        try {
          const { status, body: out } = await runIcpRequest(body, tenantCode, send);
          if (status === 200 && out.success === true) {
            send({ type: 'result', ...out });
          } else {
            send({
              type: 'error',
              error: typeof out.error === 'string' && out.error ? out.error : SYNCING_ERROR_MESSAGE,
              status,
            });
          }
        } catch (err: unknown) {
          console.error('[Appointmentlyy Data Cloud Error]:', err);
          send({ type: 'error', error: SYNCING_ERROR_MESSAGE, status: 500 });
        } finally {
          finish();
        }
      })();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
    // The workspace (used for de-duplicating pulls) comes from the session, never the request.
    const tenantCode = session.tenantCode;
    const body = (await req.json()) as IcpSearchRequestPayload;

    if (body?.stream === true && (body.mode ?? 'size') === 'pull') {
      return streamIcpPull(body, tenantCode);
    }

    const { status, body: out } = await runIcpRequest(body, tenantCode);
    return status === 200 ? NextResponse.json(out) : NextResponse.json(out, { status });
  } catch (err: unknown) {
    console.error('[Appointmentlyy Data Cloud Error]:', err);
    return NextResponse.json(
      {
        error: SYNCING_ERROR_MESSAGE,
      },
      { status: 500 }
    );
  }
}
