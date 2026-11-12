/**
 * GetLeads (app.getleads.io) as a Lead Finder data provider.
 *
 * Costs (from the GetLeads API spec): POST /contacts/search/count, GET /contacts/filter-values are
 * free; POST /contacts/search charges 1 credit per contact returned; POST /enrich/from-linkedin
 * charges 1 credit per successful enrichment. So:
 *  - 'size' only ever calls count (no paid preview rows);
 *  - 'pull' pages through /contacts/search, 100 at a time, never asking for more than the pull
 *    needs (capped at MAX_PULL_PER_REQUEST and the workspace's balance);
 *  - 'enrich_url' calls /enrich/from-linkedin for the one URL the user typed.
 *
 * Only B2B work-contact columns are requested (never personal emails, gender, birth year or pay
 * bands). A field GetLeads does not return stays empty: nothing is guessed or copied from filters.
 *
 * Everything takes a GetLeadsConfig, so a per-workspace key (BYOK) can be passed in later.
 */
import { createHash } from 'node:crypto';
import type {
  IcpFilters,
  IcpPullProgressEvent,
  IcpSearchRequestPayload,
  SanitizedIcpProspect,
} from '@/lib/leadData/types';
import { REVENUE_BAND_OPTIONS } from '@/lib/leadData/types';
import {
  ENRICH_PROGRESS_MIN_INTERVAL_MS,
  MAX_PULL_PER_REQUEST,
  PROVIDER_ERRORS,
  PROVIDER_PAGE_SIZE,
  classifyProviderError,
  partialPullNotice,
  resolveLeadDataBaseUrl,
  rowBreakdowns,
  type IcpRouteResult,
  type ProviderErrorKind,
} from './provider';
import { OA_DIRECTORY_BPO_DOMAINS, isOaBpoDirectorySearch } from './oaDirectory';

export const GETLEADS_DEFAULT_BASE_URL = 'https://app.getleads.io/api/v1';

export interface GetLeadsConfig {
  apiKey: string;
  /** e.g. https://app.getleads.io/api/v1 (no trailing slash). */
  baseUrl: string;
}

/** Platform config: the server's key, and the local test mock when allowed (see resolveLeadDataBaseUrl). */
export function getLeadsConfigFromEnv(apiKey: string): GetLeadsConfig {
  return { apiKey, baseUrl: resolveLeadDataBaseUrl(GETLEADS_DEFAULT_BASE_URL, '/api/v1') };
}

const ENGINE = 'Appointmentlyy Data Cloud v2.4';
const LOG = '[Appointmentlyy Data Cloud]';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

type CallResult =
  | { ok: true; json: Json }
  | { ok: false; kind: ProviderErrorKind; status: number; message: string };

const SEARCH_TIMEOUT_MS = 60_000;
/** Longest a streamed pull spends reporting one page's rows (see the pull loop). */
const FEED_PACE_PER_PAGE_MS = 1200;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGetLeads(cfg: GetLeadsConfig, method: 'GET' | 'POST', path: string, body?: unknown): Promise<CallResult> {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch (err: unknown) {
    console.warn(`${LOG} GetLeads request failed:`, path, err instanceof Error ? err.message : err);
    return { ok: false, kind: 'unavailable', status: 0, message: '' };
  }
  const text = await res.text().catch(() => '');
  let json: Json = {};
  try {
    const parsed = text ? JSON.parse(text) : {};
    json = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    json = {};
  }
  const message = typeof json.message === 'string' ? json.message : typeof json.error === 'string' ? json.error : '';
  const code = typeof json.code === 'string' ? json.code : '';
  const quotaCode = code === 'credits_exhausted' || code === 'fair_use_limit';
  if (!res.ok || json.ok === false) {
    console.warn(`${LOG} GetLeads refused:`, path, res.status, code, message.slice(0, 300));
    const kind: ProviderErrorKind = quotaCode
      ? 'quota'
      : classifyProviderError(res.ok ? 400 : res.status, `${code} ${message}`);
    return { ok: false, kind, status: res.status, message };
  }
  return { ok: true, json };
}

/**
 * GetLeads' own reason for a rejected request, made safe to show: no keys, variable names, URLs or
 * provider name, at most ~180 characters.
 */
export function summariseProviderMessage(message: string): string {
  let s = (message || '')
    .replace(/glb_[A-Za-z0-9_]+/g, '')
    .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(?:api[\s_-]?key|bearer|authorization|token)\b[^.;]*/gi, '')
    .replace(/get\s*leads(?:\.io)?/gi, 'the provider')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > 180) s = `${s.slice(0, 177).replace(/\s+\S*$/, '')}...`;
  return s;
}

function errorResult(kind: ProviderErrorKind, providerMessage = ''): IcpRouteResult {
  if (kind === 'rejected') {
    const why = summariseProviderMessage(providerMessage);
    if (why) {
      return {
        status: 400,
        body: {
          error: `The lead data provider couldn't run that search: ${why}${/[.!?]$/.test(why) ? '' : '.'} Adjust the filters and try again. No credits were used.`,
          reason: kind,
        },
      };
    }
  }
  const err = PROVIDER_ERRORS[kind];
  return { status: err.status, body: { error: err.message, reason: kind } };
}

// ---------------------------------------------------------------------------------------------
// Valid filter values (GET /contacts/filter-values, free), cached in memory per base URL.
// ---------------------------------------------------------------------------------------------

const VALUES_TTL_MS = 6 * 60 * 60 * 1000;
const VALUES_RETRY_MS = 60 * 1000;
const valuesCache = new Map<string, { at: number; values: string[] | null }>();

async function filterValues(cfg: GetLeadsConfig, field: string): Promise<string[] | null> {
  const key = `${cfg.baseUrl}|${field}`;
  const hit = valuesCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < (hit.values ? VALUES_TTL_MS : VALUES_RETRY_MS)) return hit.values;
  const res = await callGetLeads(cfg, 'GET', `/contacts/filter-values?field=${encodeURIComponent(field)}`);
  const values =
    res.ok && Array.isArray(res.json.values)
      ? res.json.values.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0)
      : null;
  // Keep a stale list rather than forgetting it when a refresh fails.
  valuesCache.set(key, { at: now, values: values && values.length ? values : hit?.values ?? null });
  return valuesCache.get(key)!.values;
}

/** Test hook: forget cached filter values. */
export function clearGetLeadsValueCache() {
  valuesCache.clear();
}

// ---------------------------------------------------------------------------------------------
// Filter mapping: Lead Finder filters -> GetLeads SearchFilters.
// ---------------------------------------------------------------------------------------------

const splitList = (s?: string) =>
  (s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const looksLikeDomain = (s: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(s);

function cleanDomain(s: string): string {
  return s
    .trim()
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

const normLabel = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Lead Finder seniority chips -> GetLeads seniority (c-level, vp, director, manager, senior, junior). */
function mapSeniority(list: string[]): string[] {
  const out = new Set<string>();
  for (const item of list) {
    const s = item.toLowerCase();
    if (/c-suite|c_suite|c-level|chief|owner|founder|partner|president/.test(s)) out.add('c-level');
    else if (/\bvp\b|vice/.test(s)) out.add('vp');
    else if (/director|head/.test(s)) out.add('director');
    else if (/manager/.test(s)) out.add('manager');
    else if (/senior/.test(s)) out.add('senior');
    else if (/junior|entry/.test(s)) out.add('junior');
  }
  return Array.from(out);
}

/** GetLeads job_functions (from the spec / filter-values). */
const JOB_FUNCTIONS = [
  'Operations & Supply Chain',
  'Information Technology & Engineering',
  'Consulting & Strategy',
  'Sales & Business Development',
  'Finance & Accounting',
  'Marketing & Product Management',
  'Customer Service & Support',
  'Education & Training',
  'Design & Creative Services',
  'Healthcare & Medical Services',
  'Legal & Compliance',
  'Human Resources',
  'Media, Publishing & Journalism',
  'Trades & Skilled Labor',
  'Real Estate & Property Management',
  'Program & Project Management',
  'Banking & Financial Services',
  'Public Relations & Communications',
  'Quality Assurance & Control',
];

/** Only an exact (case-insensitive) job function, or a single unambiguous department word. */
function mapDepartment(dept?: string): string[] {
  const d = (dept || '').trim();
  if (!d) return [];
  const exact = JOB_FUNCTIONS.find((f) => normLabel(f) === normLabel(d));
  if (exact) return [exact];
  const simple: [RegExp, string][] = [
    [/^sales$/i, 'Sales & Business Development'],
    [/^marketing$/i, 'Marketing & Product Management'],
    [/^(operations|ops)$/i, 'Operations & Supply Chain'],
    [/^finance$/i, 'Finance & Accounting'],
    [/^(hr|human resources|people)$/i, 'Human Resources'],
    [/^(it|engineering)$/i, 'Information Technology & Engineering'],
    [/^(customer (service|support|success)|support)$/i, 'Customer Service & Support'],
    [/^legal$/i, 'Legal & Compliance'],
  ];
  const hit = simple.find(([re]) => re.test(d));
  return hit ? [hit[1]] : [];
}

/** Lead Finder headcount option -> GetLeads company_size bands. */
function mapCompanySize(hc?: string): string[] {
  const clean = (hc || '').replace(/employees|seats|,/gi, '').trim();
  if (!clean) return [];
  if (clean === '1000+') return ['1001 to 5000', '5001 to 10000', '10001+'];
  if (clean === '10001+') return ['10001+'];
  const m = clean.match(/^(\d+)\s*(?:-|to)\s*(\d+)$/);
  if (!m) return [];
  const band = `${m[1]} to ${m[2]}`;
  const bands = ['1 to 10', '11 to 50', '51 to 200', '201 to 500', '501 to 1000', '1001 to 5000', '5001 to 10000'];
  return bands.includes(band) ? [band] : [];
}

const COUNTRY_ALIASES: Record<string, string> = {
  US: 'United States', USA: 'United States', 'U.S.': 'United States', 'U.S.A.': 'United States', AMERICA: 'United States',
  GB: 'United Kingdom', UK: 'United Kingdom', ENGLAND: 'United Kingdom', 'GREAT BRITAIN': 'United Kingdom',
  AU: 'Australia', CA: 'Canada', PH: 'Philippines', SG: 'Singapore', NZ: 'New Zealand', DE: 'Germany',
  FR: 'France', NL: 'Netherlands', IE: 'Ireland', AE: 'United Arab Emirates', UAE: 'United Arab Emirates',
  IN: 'India', ES: 'Spain', IT: 'Italy', BR: 'Brazil', MX: 'Mexico', ZA: 'South Africa', JP: 'Japan',
  HK: 'Hong Kong', KR: 'South Korea', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland',
  CH: 'Switzerland', AT: 'Austria', BE: 'Belgium', PT: 'Portugal', PL: 'Poland', IL: 'Israel',
  SA: 'Saudi Arabia', QA: 'Qatar', MY: 'Malaysia', ID: 'Indonesia', TH: 'Thailand', VN: 'Vietnam',
  CN: 'China', TW: 'Taiwan', AR: 'Argentina', CO: 'Colombia', CL: 'Chile',
};
const KNOWN_COUNTRY_NAMES = new Set(Object.values(COUNTRY_ALIASES));
/** Same default market as the LeadOcean path when no country is given. */
const DEFAULT_COUNTRIES = ['United States', 'Philippines', 'Australia', 'United Kingdom', 'Canada'];

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
const AU_STATES: Record<string, string> = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', WA: 'Western Australia', SA: 'South Australia',
  TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory',
};
/** Region placeholders that are not a state name (e.g. a blueprint's "Global BPO Hubs"). */
const NOT_A_STATE = /\b(global|hubs?|any|all|nationwide|worldwide|remote|various|multiple|regions?|everywhere)\b/i;

/** Lead Finder industry presets -> canonical LinkedIn labels (checked against the spec's 441). */
const INDUSTRY_PRESET_LABELS: Record<string, string[]> = {
  'outsourcing / offshoring (bpo)': ['Outsourcing and Offshoring Consulting', 'Telephone Call Centers'],
  'construction & commercial hvac': [
    'Construction',
    'Building Construction',
    'Nonresidential Building Construction',
    'HVAC and Refrigeration Equipment Manufacturing',
  ],
  'computer software & saas': ['Software Development'],
  'renewables & solar energy': [
    'Renewable Energy Power Generation',
    'Solar Electric Power Generation',
    'Renewable Energy Equipment Manufacturing',
    'Services for Renewable Energy',
  ],
  telecommunications: ['Telecommunications', 'Telecommunications Carriers'],
  'financial services & fintech': ['Financial Services'],
  'healthcare & medical devices': ['Hospitals and Health Care', 'Medical Equipment Manufacturing'],
  'real estate & property management': ['Real Estate', 'Commercial Real Estate'],
  'logistics & supply chain': [
    'Transportation; Logistics; Supply Chain and Storage',
    'Truck Transportation',
    'Freight and Package Transportation',
  ],
  'marketing & advertising agencies': ['Advertising Services', 'Marketing Services'],
};

const INDUSTRY_KEYWORDS: [RegExp, string[]][] = [
  [/\bbpo\b|outsourc|offshor/i, ['Outsourcing and Offshoring Consulting']],
  [/call cent|contact cent/i, ['Telephone Call Centers']],
  [/\bsaas\b|software/i, ['Software Development']],
  [/staffing|recruit/i, ['Staffing and Recruiting']],
  [/\bit services\b|managed services|\bmsp\b/i, ['IT Services and IT Consulting']],
];

const STOP = new Set(['and', 'the', 'of', 'for', 'services', 'companies', 'agencies', 'industry']);

/**
 * Free-text industry -> canonical labels GetLeads accepts. Never sends a label that is not in its
 * list; anything that cannot be resolved is reported in `notes` and left out.
 */
async function resolveIndustries(cfg: GetLeadsConfig, input: string, notes: string[]): Promise<string[]> {
  const raw = input.trim();
  if (!raw) return [];
  const known = await filterValues(cfg, 'industries');
  const knownSet = known ? new Map(known.map((v) => [normLabel(v), v])) : null;
  const accept = (labels: string[]) =>
    knownSet ? labels.map((l) => knownSet.get(normLabel(l))).filter((l): l is string => Boolean(l)) : labels;

  const preset = INDUSTRY_PRESET_LABELS[raw.toLowerCase()];
  if (preset) return accept(preset);

  const out = new Set<string>();
  for (const part of splitList(raw)) {
    const keyword = INDUSTRY_KEYWORDS.find(([re]) => re.test(part));
    if (knownSet?.has(normLabel(part))) {
      out.add(knownSet.get(normLabel(part))!);
    } else if (keyword) {
      accept(keyword[1]).forEach((l) => out.add(l));
    } else if (known) {
      const words = normLabel(part).split(' ').filter((w) => w.length >= 3 && !STOP.has(w));
      const matches = words.length
        ? known.filter((label) => {
            const lw = normLabel(label).split(' ');
            return words.every((w) => lw.some((x) => x.startsWith(w)));
          })
        : [];
      matches.sort((a, b) => a.length - b.length).slice(0, 3).forEach((l) => out.add(l));
      if (!matches.length) notes.push(`Industry "${part}" isn't one of the provider's industry labels, so it was left out.`);
    } else {
      notes.push(`Industry "${part}" couldn't be checked against the provider's industry list right now, so it was left out.`);
    }
  }
  return Array.from(out);
}

async function resolveCountries(cfg: GetLeadsConfig, input: string | undefined, notes: string[]): Promise<string[]> {
  const parts = splitList(input);
  if (!parts.length || parts.some((p) => p.toUpperCase() === 'GLOBAL')) return DEFAULT_COUNTRIES;
  const known = await filterValues(cfg, 'countries');
  const knownMap = known ? new Map(known.map((v) => [v.toLowerCase(), v])) : null;
  const out = new Set<string>();
  for (const p of parts) {
    const alias = COUNTRY_ALIASES[p.toUpperCase()];
    const name = alias || p;
    const canonical = knownMap ? knownMap.get(name.toLowerCase()) : KNOWN_COUNTRY_NAMES.has(name) ? name : undefined;
    if (canonical) out.add(canonical);
    else notes.push(`Country "${p}" isn't a country name the provider knows, so it was left out.`);
  }
  return out.size ? Array.from(out) : DEFAULT_COUNTRIES;
}

function resolveStates(input: string | undefined, notes: string[]): string[] {
  const out = new Set<string>();
  for (const p of splitList(input)) {
    if (NOT_A_STATE.test(p)) {
      notes.push(`"${p}" isn't a state or province name, so the search covers every state.`);
      continue;
    }
    const up = p.toUpperCase();
    out.add(US_STATES[up] || AU_STATES[up] || p);
  }
  return Array.from(out);
}

const FUNDING_STAGE_VALUES: Record<string, string[]> = {
  pre_seed: ['pre seed', 'angel', 'accelerator/inc'],
  seed: ['seed', 'seed extension'],
  series_a: ['series a', 'series a extension', 'series a1 extension', 'series a2 extension', 'series a3 extension', 'series aa', 'series aa extension'],
  series_b: ['series b', 'series b extension', 'series b1 extension', 'series b2 extension', 'series bb', 'series bb extension'],
  series_c_plus: [
    'series c', 'series c extension', 'series c1 extension', 'series c2 extension', 'series cc', 'series cc extension',
    'series d', 'series d extension', 'series dd', 'series dd extension', 'series e', 'series e extension',
    'series e1 extension', 'series e2 extension', 'series f', 'series f extension', 'series g', 'series g extension',
    'series h', 'series h extension', 'series i', 'series i extension',
  ],
  private_equity: ['private equity', 'pe growth', 'buyout/lbo'],
  ipo: ['ipo', 'post-ipo'],
};

async function resolveFunding(cfg: GetLeadsConfig, stages: string[]): Promise<string[]> {
  const wanted = stages.flatMap((k) => FUNDING_STAGE_VALUES[k] || []);
  if (!wanted.length) return [];
  const known = await filterValues(cfg, 'funding_types');
  const set = known ? new Set(known.map((v) => v.toLowerCase())) : null;
  return Array.from(new Set(set ? wanted.filter((v) => set.has(v)) : wanted));
}

function monthsAgoIso(months: number, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export interface GetLeadsFilterResult {
  filters: Json;
  /** Plain-English notes about filters that could not be applied as typed. */
  notes: string[];
}

export async function buildGetLeadsFilters(f: IcpFilters, cfg: GetLeadsConfig): Promise<GetLeadsFilterResult> {
  const out: Json = {};
  const notes: string[] = [];

  if (isOaBpoDirectorySearch(f)) {
    // Same audience as the LeadOcean path: the Outsource Accelerator BPO directory's companies.
    out.domains = OA_DIRECTORY_BPO_DOMAINS;
    const sen = mapSeniority(f.seniority?.length ? f.seniority : ['C-Suite', 'VP', 'Director', 'Owner']);
    if (sen.length) out.seniority = sen;
  } else {
    const titles = splitList(f.titles);
    if (titles.length) out.job_titles = titles;
    const excludeTitles = splitList(f.excludeTitles);
    if (excludeTitles.length) out.exclude_job_titles = excludeTitles;
    if (f.seniority?.length) {
      const sen = mapSeniority(f.seniority);
      if (sen.length) out.seniority = sen;
    }
    const functions = mapDepartment(f.department);
    if (functions.length) out.job_functions = functions;
    const sizes = mapCompanySize(f.headcountRange);
    if (sizes.length) out.company_size = sizes;

    out.countries = await resolveCountries(cfg, f.country, notes);
    const states = resolveStates(f.state, notes);
    if (states.length) out.states = states;
    const cities = splitList(f.city);
    if (cities.length) out.cities = cities;

    // Company keywords: domains narrow to those companies (as on LeadOcean); words search the
    // company's LinkedIn About text.
    const kw = splitList(f.companyKeywords);
    const domains = kw.map(cleanDomain).filter((s) => looksLikeDomain(s));
    const words = kw.filter((s) => !looksLikeDomain(cleanDomain(s)));
    if (domains.length) {
      out.domains = Array.from(new Set(domains));
    } else if (f.industry?.trim()) {
      const industries = await resolveIndustries(cfg, f.industry, notes);
      if (industries.length) out.industries = industries;
    }
    if (words.length) out.company_description = words.join(' ');

    // "Tools they use": tool names only (a website is not a technology).
    const tech = splitList(f.technologies).filter((t) => !looksLikeDomain(cleanDomain(t)));
    if (tech.length) out.technologies = tech;
  }

  if (f.requirePhone !== false) out.require_phone = true;
  // Only people whose employer is a real company profile: without this, self-employed people come
  // back with "Gmail" or a job title as the company name, which looks broken in a pull.
  out.require_company_profile = true;
  if (f.requireVerifiedEmail !== false) out.email_status = ['VALID'];

  // Extra filters (GetLeads only).
  const revenue = (f.revenue || []).filter((r) => (REVENUE_BAND_OPTIONS as readonly string[]).includes(r));
  if (revenue.length) out.revenue = revenue;
  if (f.fundingStages?.length) {
    const funding = await resolveFunding(cfg, f.fundingStages);
    if (funding.length) out.funding_types = funding;
  }
  if (f.newInRoleMonths && [3, 6, 12].includes(Number(f.newInRoleMonths))) {
    out.job_start_date_min = monthsAgoIso(Number(f.newInRoleMonths));
  }
  const bio = (f.personKeywords || '').trim().slice(0, 120);
  if (bio) out.person_description = bio;
  if (f.requireDirectDial === true) out.require_direct_dial = true;
  if (f.isHiring === true) out.is_hiring = true;

  return { filters: out, notes };
}

// ---------------------------------------------------------------------------------------------
// Contacts -> SanitizedIcpProspect
// ---------------------------------------------------------------------------------------------

/** Columns a pull asks for: work contact data only (never personal_emails, gender, birth year, pay bands). */
export const GETLEADS_COLUMNS = [
  'full_name',
  'first_name',
  'last_name',
  'current_title',
  'seniority_level',
  'department',
  'work_email',
  'email_status',
  'mobile_phone',
  'direct_phone',
  'linkedin_url',
  'company_name',
  'company_website',
  'company_domain',
  'company_linkedin_url',
  'main_industry',
  'company_industry',
  'linkedin_employee_count_exact',
  'employee_count_range',
  'contact_location',
  'contact_city',
  'contact_state',
  'contact_country',
  'company_tech_stack',
];

/**
 * Where each field may appear: the canonical column name first, then GetLeads' display label and
 * internal name (rows can be keyed by any of them), then names enrichment results use.
 */
const FIELD_KEYS: Record<string, string[]> = {
  full_name: ['full_name', 'Full Name', 'name', 'fullName'],
  first_name: ['first_name', 'First Name', 'firstName'],
  last_name: ['last_name', 'Last Name', 'lastName'],
  current_title: ['current_title', 'Current Title', 'job_title', 'title', 'jobTitle'],
  seniority_level: ['seniority_level', 'Seniority Level', 'current_seniority', 'seniority'],
  department: ['department', 'Department', 'current_function'],
  work_email: ['work_email', 'Work Email', 'workEmail', 'email'],
  email_status: ['email_status', 'Email Status', 'emailStatus'],
  mobile_phone: ['mobile_phone', 'Mobile Phone', 'mobilePhone'],
  direct_phone: ['direct_phone', 'Direct Phone', 'direct_dial', 'directPhone'],
  linkedin_url: ['linkedin_url', 'LinkedIn URL', 'linkedinUrl'],
  company_name: ['company_name', 'Company Name', 'co_name', 'current_employer', 'Current Employer', 'current_company_name', 'company'],
  company_website: ['company_website', 'Company Website', 'co_website', 'current_employer_website', 'website'],
  company_domain: ['company_domain', 'Company Domain', 'org_domain', 'domain'],
  company_linkedin_url: ['company_linkedin_url', 'Company LinkedIn URL', 'current_company_linkedin_url', 'current_employer_linkedin_url'],
  industry: ['main_industry', 'Main Industry', 'company_industry', 'Company Industry', 'current_company_industry', 'industry'],
  employee_count_exact: ['linkedin_employee_count_exact', 'LinkedIn Employee Count Exact', 'linkedin_employee_count'],
  employee_count_range: ['employee_count_range', 'Employee Count Range'],
  location: ['contact_location', 'Contact Location', 'current_location', 'location'],
  city: ['contact_city', 'Contact City'],
  state: ['contact_state', 'Contact State'],
  country: ['contact_country', 'Contact Country'],
  tech: ['company_tech_stack', 'Company Tech Stack', 'company_technologies', 'technologies'],
};

function pick(row: Json, field: string): unknown {
  for (const k of FIELD_KEYS[field] || [field]) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function text(row: Json, field: string): string {
  const v = pick(row, field);
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim()).join(', ');
  return '';
}

function absoluteUrl(v: string): string {
  const s = v.trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s.replace(/^\/+/, '')}`;
}

function techList(row: Json): string[] {
  const v = pick(row, 'tech');
  let list: unknown[] = [];
  if (Array.isArray(v)) list = v;
  else if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        list = [];
      }
    } else list = s.split(/[,;|]/);
  }
  const names = list
    .map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' && typeof (x as Json).name === 'string' ? (x as Json).name : ''))
    .map((x: string) => x.trim())
    .filter(Boolean);
  return Array.from(new Set(names)).slice(0, 15);
}

function headcountLabel(row: Json): string {
  const exactRaw = pick(row, 'employee_count_exact');
  const exact = typeof exactRaw === 'number' ? exactRaw : Number(String(exactRaw ?? '').replace(/,/g, ''));
  if (Number.isFinite(exact) && exact > 0) return `${Math.round(exact).toLocaleString('en-US')} employees`;
  const band = text(row, 'employee_count_range');
  if (!band) return '';
  return `${band.replace(/\d{4,}/g, (n) => Number(n).toLocaleString('en-US'))} employees`;
}

function stableId(linkedinUrl: string, email: string, name: string, company: string, title: string): string {
  const key = linkedinUrl
    ? linkedinUrl.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[?#]/)[0].replace(/\/+$/, '')
    : email
      ? email.toLowerCase()
      : `${name}|${company}|${title}`.toLowerCase();
  return `APLY-${createHash('sha256').update(`getleads:${key}`).digest('hex').slice(0, 10).toUpperCase()}`;
}

/** At most this many people per company in one pull, so a list is not three partners of one firm. */
const MAX_PER_COMPANY = 2;

/** Personal mailbox providers: an address here is not a work email. */
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me', 'gmx.com', 'mail.com', 'zoho.com',
  'yandex.com', 'comcast.net', 'att.net', 'verizon.net', 'sbcglobal.net', 'bigpond.com', 'bigpond.net.au',
  'optusnet.com.au',
]);

/** Big employers whose domain shows up on small-business owners' rows (a past job, not their company). */
const BIG_EMPLOYER_DOMAINS = new Set([
  'google.com', 'linkedin.com', 'microsoft.com', 'amazon.com', 'facebook.com', 'meta.com', 'apple.com',
  'salesforce.com', 'oracle.com', 'ibm.com',
]);

/**
 * Whether a "work email" plausibly belongs to the person's current company. Free mailboxes never do;
 * when the company domain is known the email must be on it (or a subdomain); when it is unknown, a
 * big-tech domain is treated as a stale past employer.
 */
export function emailMatchesCompany(email: string, companyDomain: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const ed = email.slice(at + 1).trim().toLowerCase();
  if (!ed || FREE_MAIL_DOMAINS.has(ed)) return false;
  const cd = looksLikeDomain(companyDomain) ? companyDomain.toLowerCase() : '';
  if (cd) return ed === cd || ed.endsWith(`.${cd}`) || cd.endsWith(`.${ed}`);
  return !BIG_EMPLOYER_DOMAINS.has(ed);
}

/** One GetLeads contact (search row or enrichment data) as a Lead Finder prospect. */
export function parseGetLeadsContact(row: Json): SanitizedIcpProspect {
  const name = text(row, 'full_name') || [text(row, 'first_name'), text(row, 'last_name')].filter(Boolean).join(' ');
  const company = text(row, 'company_name');
  const title = text(row, 'current_title');

  // Only a deliverable (VALID) work email is kept, as on LeadOcean: catch-all, invalid or other
  // statuses are dropped so reps never send to a guess. An email with no status at all (possible in
  // an enrichment result) is kept but not marked verified.
  const status = text(row, 'email_status').toUpperCase();
  const rawEmail = text(row, 'work_email');
  const verifiedStatus = status === 'VALID' || status === 'VERIFIED';
  const rawEmailOk = /@/.test(rawEmail) && (verifiedStatus || !status) ? rawEmail : '';

  const phone = text(row, 'mobile_phone') || text(row, 'direct_phone');

  const websiteRaw = text(row, 'company_website').trim().replace(/^[^a-z0-9]+/i, '');
  const domainRaw = cleanDomain(text(row, 'company_domain') || websiteRaw);
  const domain = looksLikeDomain(domainRaw) ? domainRaw : '';
  const website = websiteRaw && looksLikeDomain(cleanDomain(websiteRaw)) ? absoluteUrl(websiteRaw) : domain ? `https://${domain}` : '';
  // A "work email" at a free mailbox or at another company's domain is dropped: the phone stays.
  const email = rawEmailOk && emailMatchesCompany(rawEmailOk, domain) ? rawEmailOk : '';
  const emailVerified = Boolean(email) && verifiedStatus;
  const linkedinUrl = absoluteUrl(text(row, 'linkedin_url'));
  const companyLinkedinUrl = absoluteUrl(text(row, 'company_linkedin_url'));

  const location =
    text(row, 'location') || [text(row, 'city'), text(row, 'state'), text(row, 'country')].filter(Boolean).join(', ');

  return {
    id: stableId(linkedinUrl, rawEmail, name, company, title),
    name,
    company,
    title,
    seniority: text(row, 'seniority_level'),
    department: text(row, 'department'),
    email,
    emailVerified,
    phone,
    hasDirectPhone: Boolean(phone),
    headcount: headcountLabel(row),
    industry: text(row, 'industry'),
    location,
    website,
    companyDomain: domain,
    linkedinUrl,
    ...(companyLinkedinUrl ? { companyLinkedinUrl } : {}),
    technologies: techList(row),
  };
}

// ---------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------

function totalFrom(value: unknown, isMinimum: unknown): { total: number | null; isMinimum: boolean } {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return { total: null, isMinimum: false };
  return { total: value, isMinimum: isMinimum === true };
}

async function enrichLinkedinUrl(cfg: GetLeadsConfig, url: string): Promise<IcpRouteResult> {
  const cleanUrl = url.trim();
  if (!/linkedin\.com\/in\/[^/?#\s]+/i.test(cleanUrl)) {
    return {
      status: 400,
      body: { error: 'Could not enrich that LinkedIn profile URL. Ensure it is a valid https://www.linkedin.com/in/... URL.' },
    };
  }
  const res = await callGetLeads(cfg, 'POST', '/enrich/from-linkedin', {
    items: [{ linkedin_url: absoluteUrl(cleanUrl) }],
    limit_per_item: 1,
  });
  if (!res.ok) return errorResult(res.kind, res.message);
  const results: Json[] = Array.isArray(res.json.results) ? res.json.results : [];
  const first = results[0];
  const data: Json | null = first && first.success !== false && first.data && typeof first.data === 'object' ? first.data : null;
  if (!data) {
    if (res.json.credits_exhausted === true) return errorResult('quota');
    return {
      status: 404,
      body: { error: 'No contact details were found for that LinkedIn profile. No credits were used.' },
    };
  }
  const prospect = parseGetLeadsContact({
    ...data,
    ...(pick(data, 'linkedin_url') ? {} : { linkedin_url: first.linkedinUrl || cleanUrl }),
    ...(pick(data, 'work_email') || !first.email ? {} : { work_email: first.email }),
  });
  return {
    status: 200,
    body: { success: true, engine: ENGINE, mode: 'enrich_url', provider: 'getleads', prospect },
  };
}

/**
 * The whole GetLeads search / pull / single-enrich implementation (same result shape as the
 * LeadOcean path, plus `provider`, `totalIsMinimum`, `nextOffset`, `filterNotes`, `previewRows`).
 * `onProgress` is only called for pulls, and only when the caller streams.
 */
export async function runGetLeadsRequest(
  body: IcpSearchRequestPayload,
  cfg: GetLeadsConfig,
  onProgress?: (event: IcpPullProgressEvent) => void
): Promise<IcpRouteResult> {
  const { mode = 'size', pullCount = 25, linkedinUrlToEnrich, filters = {} } = body;

  if (mode === 'enrich_url' && linkedinUrlToEnrich?.trim()) {
    return enrichLinkedinUrl(cfg, linkedinUrlToEnrich);
  }

  const { filters: searchFilters, notes } = await buildGetLeadsFilters(filters, cfg);

  // ------------------------------------------------------------------ size: free count only
  if (mode !== 'pull') {
    const res = await callGetLeads(cfg, 'POST', '/contacts/search/count', searchFilters);
    if (!res.ok) return errorResult(res.kind, res.message);
    const { total, isMinimum } = totalFrom(res.json.total_matching, res.json.total_matching_is_minimum);
    return {
      status: 200,
      body: {
        success: true,
        engine: ENGINE,
        mode,
        provider: 'getleads',
        totalMatching: total,
        totalIsMinimum: isMinimum,
        // Every returned profile costs a credit, so the free preview shows the count only.
        previewRows: false,
        returnedCount: 0,
        nextCursor: null,
        prospects: [],
        breakdowns: null,
        filterNotes: notes,
      },
    };
  }

  // ------------------------------------------------------------------ pull: paid, paged by offset
  const requestedCount = Math.max(1, Math.floor(Number(pullCount)) || 25);
  const balanceCap =
    typeof body.maxRecords === 'number' && Number.isFinite(body.maxRecords)
      ? Math.max(0, Math.floor(body.maxRecords))
      : Infinity;
  if (balanceCap < 1) {
    return {
      status: 402,
      body: { error: 'Your workspace has no lead records available right now. Top up your quota to add records.' },
    };
  }
  const target = Math.min(requestedCount, MAX_PULL_PER_REQUEST, balanceCap);
  const startOffset =
    filters.excludePreviouslyPulled !== false && typeof body.offset === 'number' && Number.isFinite(body.offset)
      ? Math.max(0, Math.floor(body.offset))
      : 0;

  onProgress?.({ type: 'stage', stage: 'searching' });

  // Pages never ask for more than the rows still needed, so credits spent <= target (plus any
  // duplicate GetLeads repeats across pages, which are dropped and bounded by maxBatches).
  const maxBatches = Math.ceil(target / PROVIDER_PAGE_SIZE) + 1;
  let offset = startOffset;
  let batches = 0;
  let found = 0;
  let totalMatching: number | null = null;
  let totalIsMinimum = false;
  let stoppedBy: ProviderErrorKind | null = null;
  let withEmail = 0;
  let withPhone = 0;
  const seen = new Set<string>();
  const prospects: SanitizedIcpProspect[] = [];

  for (;;) {
    const limit = Math.min(PROVIDER_PAGE_SIZE, target - found);
    const res = await callGetLeads(cfg, 'POST', '/contacts/search', {
      ...searchFilters,
      limit,
      offset,
      max_per_company: MAX_PER_COMPANY,
      columns: GETLEADS_COLUMNS,
    });
    batches++;
    if (!res.ok) {
      if (prospects.length === 0) return errorResult(res.kind, res.message);
      stoppedBy = res.kind;
      break;
    }
    const json = res.json;
    const rows: Json[] = Array.isArray(json.contacts) ? json.contacts : [];
    if (batches === 1) {
      const t = totalFrom(json.total_available, json.total_available_is_minimum);
      // A lower bound is not "the total": the panel shows it as unknown rather than as exact.
      totalMatching = t.isMinimum ? null : t.total;
      totalIsMinimum = t.isMinimum;
      if (totalMatching === null && !t.isMinimum && rows.length === 0 && json.has_more === false && startOffset === 0) {
        totalMatching = 0;
      }
    }

    const pageProspects: SanitizedIcpProspect[] = [];
    for (const row of rows) {
      if (found + pageProspects.length >= target) break;
      const p = parseGetLeadsContact(row && typeof row === 'object' ? row : {});
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      pageProspects.push(p);
    }
    found += pageProspects.length;

    const returned = typeof json.returned === 'number' ? json.returned : rows.length;
    const nextOffset = typeof json.next_offset === 'number' && json.next_offset > offset ? json.next_offset : offset + returned;
    const hasMore = json.has_more === true || (json.has_more === undefined && rows.length >= limit && rows.length > 0);
    const creditsOut = json.credits_exhausted === true && found < target;
    if (creditsOut) stoppedBy = 'quota';

    const complete = found >= target || !hasMore || rows.length === 0 || batches >= maxBatches || creditsOut;
    const planned = complete ? found : Math.max(found, totalMatching !== null ? Math.min(target, totalMatching) : target);
    onProgress?.({ type: 'found', count: found, totalMatching, planned, complete, batch: batches });

    // A GetLeads page arrives whole (contact details included), so each row is reported as its own
    // `enriched` event, spaced a little (at most FEED_PACE_PER_PAGE_MS per page) so the panel can
    // show every real row and its real email/phone flags instead of one jump. Counts are always
    // the rows actually received; only streamed pulls are paced.
    const gap = onProgress
      ? Math.min(ENRICH_PROGRESS_MIN_INTERVAL_MS, Math.max(5, Math.floor(FEED_PACE_PER_PAGE_MS / Math.max(1, pageProspects.length))))
      : 0;
    for (let i = 0; i < pageProspects.length; i++) {
      const p = pageProspects[i];
      prospects.push(p);
      if (!onProgress) continue;
      // The panel labels these "verified emails" / "direct phones": count only VALID emails.
      if (p.emailVerified) withEmail++;
      if (p.phone) withPhone++;
      onProgress({
        type: 'enriched',
        done: prospects.length,
        total: planned,
        withEmail,
        withPhone,
        lastLead: { company: p.company, title: p.title, hasEmail: p.emailVerified, hasPhone: Boolean(p.phone) },
      });
      if (gap && i < pageProspects.length - 1) await sleep(gap);
    }

    offset = nextOffset;
    if (complete) break;
  }

  if (stoppedBy && prospects.length === 0) return errorResult(stoppedBy);

  return {
    status: 200,
    body: {
      success: true,
      engine: ENGINE,
      mode,
      provider: 'getleads',
      totalMatching,
      totalIsMinimum,
      returnedCount: prospects.length,
      nextCursor: null,
      // Where the next pull with these filters should start (the browser keeps it per filter set).
      nextOffset: offset,
      prospects,
      breakdowns: rowBreakdowns(prospects),
      filterNotes: notes,
      requestedCount: target,
      batches,
      ...(stoppedBy
        ? { stoppedReason: stoppedBy, notice: partialPullNotice(stoppedBy, prospects.length, target) }
        : {}),
    },
  };
}
