/**
 * AI filter building for Lead Finder (server-only).
 *
 * Shared by POST /api/intelligence/icp/ai-parse (one prompt -> filters) and
 * POST /api/intelligence/icp/brainstorm (a short Q&A that ends in the same filters):
 *  - FILTER_SCHEMA / FILTER_RULES: what the model may return, with every allowed value spelled out;
 *  - sanitizeAiFilters: maps whatever comes back onto Lead Finder's allowed values (near-misses are
 *    mapped, never silently swapped for a default) and records each adjustment in `notes`;
 *  - keywordParse: the no-AI fallback;
 *  - generateJson: one Gemini-REST `generateContent` call (answered by Claude in production through
 *    the Anthropic bridge), JSON-only with a response schema, temperature 0.
 * The AI only fills filters. It never generates people, companies or data.
 */
import type { AiParsedFilters } from '@/lib/leadData/types';
import {
  FUNDING_STAGE_OPTIONS,
  JOB_FUNCTION_OPTIONS,
  NEW_IN_ROLE_OPTIONS,
  REVENUE_BAND_OPTIONS,
} from '@/lib/leadData/types';
import { COMPANY_SIZE_BANDS, companySizeBandKeys, companySizeLabel } from '@/lib/leadData/companySize';
import { cleanCommittee, committeeTitles } from '@/lib/leadData/committee';
import { GETLEADS_COUNTRIES, GETLEADS_INDUSTRIES } from './getleadsValues';

export const SENIORITY_VALUES = ['C-Suite', 'VP', 'Director', 'Owner', 'Partner', 'Manager'] as const;
/** Lead Finder's default markets when a request names no location (same as the provider default). */
export const DEFAULT_MARKETS = ['United States', 'Philippines', 'Australia', 'United Kingdom', 'Canada'];

const SIZE_KEYS = COMPANY_SIZE_BANDS.map((b) => b.key);
const FUNDING_KEYS = FUNDING_STAGE_OPTIONS.map((o) => o.key);

// ---------------------------------------------------------------------------------------------
// Schema + rules given to the model
// ---------------------------------------------------------------------------------------------

const strList = (description: string, values?: readonly string[]) => ({
  type: 'ARRAY',
  description,
  items: values ? { type: 'STRING', enum: [...values] } : { type: 'STRING' },
});

/** Gemini responseSchema (OpenAPI subset) for one filter set. */
export const FILTER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    titles: strList('Job titles to include, with common equivalent spellings.'),
    excludeTitles: strList('Job titles to leave out (only when the user asked).'),
    seniority: strList('Seniority levels.', SENIORITY_VALUES),
    jobFunction: { type: 'STRING', description: `One of: ${JOB_FUNCTION_OPTIONS.join(' | ')}; or "".` },
    industries: strList('Exact labels from the INDUSTRY LIST.'),
    excludeIndustries: strList('Exact labels from the INDUSTRY LIST to leave out.'),
    companySizeBands: strList('Employee-count bands covering the requested size.', SIZE_KEYS),
    countries: strList('Full English country names.'),
    states: strList('Full state / province names.'),
    cities: strList('City names.'),
    technologies: strList('Software / tools the companies use.'),
    revenue: strList('Company revenue bands covering the requested revenue.', REVENUE_BAND_OPTIONS),
    fundingStages: strList('Last funding round.', FUNDING_KEYS),
    newInRoleMonths: { type: 'INTEGER', description: 'Started current role within N months: 0, 3, 6 or 12.' },
    personKeywords: { type: 'STRING', description: 'Keyword(s) in the person\'s LinkedIn About / bio, or "".' },
    companyKeywords: { type: 'STRING', description: 'Keyword(s) in the company description, or "".' },
    isHiring: { type: 'BOOLEAN' },
    requireDirectDial: { type: 'BOOLEAN' },
    requirePhone: { type: 'BOOLEAN' },
    requireVerifiedEmail: { type: 'BOOLEAN' },
    suggestedFolderName: { type: 'STRING' },
    interpretation: { type: 'STRING' },
  },
  required: [
    'titles', 'excludeTitles', 'seniority', 'jobFunction', 'industries', 'excludeIndustries', 'companySizeBands',
    'countries', 'states', 'cities', 'technologies', 'revenue', 'fundingStages', 'newInRoleMonths',
    'personKeywords', 'companyKeywords', 'isHiring', 'requireDirectDial', 'requirePhone',
    'requireVerifiedEmail', 'suggestedFolderName', 'interpretation',
  ],
} as const;

/** What each filter means and how to fill it. Shared by the one-shot parser and the brainstorm. */
export const FILTER_RULES = `FILTERS (B2B contact database built from LinkedIn; every filter narrows the search, filters combine with AND):
- titles: job titles the user named or clearly implied, plus the common equivalent spellings (max 12). Examples: "COO" -> "COO", "Chief Operating Officer"; "CFO" -> "CFO", "Chief Financial Officer"; "founders" -> "Founder", "Co-Founder"; "owners" -> "Owner", "Co-Owner"; "CEO" -> "CEO", "Chief Executive Officer"; "VP of Sales" -> "VP of Sales", "Vice President of Sales", "VP Sales"; "Head of Customer Support" -> "Head of Customer Support", "Head of Customer Service", "Head of Support". Owners of professional firms (accounting, law, consulting, agencies) -> "Owner", "Co-Owner", "Founder", "Principal", "Partner", "Managing Partner". Never add plural forms. A title like "Head of X" or "VP of X" is a title.
- When people are described by department + level instead of titles ("operations leaders", "HR directors", "sales leadership", "finance managers", "marketing executives"), leave titles empty and use jobFunction + seniority.
- seniority (only these values: ${SENIORITY_VALUES.join(', ')}): the levels of the people asked for. CEO/COO/CFO/CTO/CMO/CRO/President/any "Chief ..." -> C-Suite; Founder/Owner -> Owner; VP -> VP; Director and "Head of" -> Director (add VP too for "Head of"); Partner -> Partner; Manager -> Manager. "leaders"/"leadership"/"heads"/"decision makers" -> C-Suite, VP, Director (plus Owner for small companies or when founders/owners are meant). "executives" -> C-Suite, VP. If the request does not describe the people at all, use the decision-maker default C-Suite, Owner, VP, Director and say so.
- jobFunction: exactly one of: ${JOB_FUNCTION_OPTIONS.join(' | ')}. Only for department-described people (see above); otherwise "". HR -> "Human Resources"; operations -> "Operations & Supply Chain"; customer support/service/success/CX -> "Customer Service & Support"; sales -> "Sales & Business Development"; finance -> "Finance & Accounting"; marketing -> "Marketing & Product Management"; IT/engineering -> "Information Technology & Engineering".
- excludeTitles: only titles the user asked to leave out ("exclude interns and assistants" -> "Intern", "Assistant").
- industries / excludeIndustries: only exact labels from the INDUSTRY LIST below, only for industries the user mentioned. Map the user's words to the closest 1-4 labels; never add an industry the user did not ask for. Niches that have no real LinkedIn label (fintech, e-commerce / online brands / DTC, proptech, insurtech, healthtech, edtech, martech, legaltech, and trades such as HVAC, plumbing, roofing, electrical or solar installers): leave industries empty for them and put the niche word in companyKeywords instead ("fintech", "e-commerce", "HVAC"...), and say so in interpretation; loose labels like "Online and Mail Order Retail" hold almost no companies. Never use the plain "Retail" label (it means physical shops) unless the user explicitly asks for retail stores. Common mappings: SaaS/software -> "Software Development"; financial services -> "Financial Services"; BPO/outsourcing/offshoring -> "Outsourcing and Offshoring Consulting"; call/contact centres -> "Telephone Call Centers"; logistics/freight/3PL -> "Transportation; Logistics; Supply Chain and Storage", "Truck Transportation", "Freight and Package Transportation", "Warehousing and Storage"; healthcare -> "Hospitals and Health Care", "Medical Practices"; manufacturing -> "Manufacturing" plus the 2-3 biggest sub-labels only if the user named a kind of manufacturing; real estate -> "Real Estate", "Real Estate Agents and Brokers"; agencies (marketing/ad/digital) -> "Advertising Services", "Marketing Services"; staffing/recruiting -> "Staffing and Recruiting"; executive search -> "Executive Search Services"; IT services/MSP -> "IT Services and IT Consulting"; insurance -> "Insurance"; law firms -> "Law Practice", "Legal Services"; accounting firms -> "Accounting"; construction -> "Construction". "No agencies" -> excludeIndustries "Advertising Services", "Marketing Services".
- companySizeBands (only these: ${SIZE_KEYS.join(', ')}): every band the requested employee range overlaps; a number on a band edge belongs to the band it starts or ends ("11 to 50" -> 11-50; "50-250" -> 51-200, 201-500; "over 500" / "500+" -> 501-1000, 1001-5000, 5001-10000, 10001+; "under 50" -> 1-10, 11-50). Vague: "small businesses"/"SMBs" -> 11-50, 51-200 (say so); "startups" -> 1-10, 11-50; "mid-market"/"mid-sized" -> 51-200, 201-500, 501-1000; "enterprise"/"large" -> 1001-5000, 5001-10000, 10001+. No size mentioned -> [] (any size). When the range spans several bands or is approximate, say which bands in interpretation.
- countries: full English names ("United States", "United Kingdom", "Australia", "Canada", "New Zealand", "Philippines", ...). US/USA/America -> "United States"; UK/England/Britain -> "United Kingdom". When the user names states or cities, also give their country. Regions: "North America" -> United States, Canada; "ANZ" -> Australia, New Zealand; "DACH" -> Germany, Austria, Switzerland. No location at all -> [] (the app then uses its default markets).
- states: full names ("California", "Texas", "New South Wales"), only when named. cities: only when named ("Sydney", "Melbourne"); do not add the state for a city.
- technologies: only tools the user said the companies use ("using HubSpot" -> "HubSpot").
- revenue (only these: ${REVENUE_BAND_OPTIONS.join(', ')}): every band the requested revenue overlaps ("$10M-$50M" -> "$10M to <$50M"; "over $100M" -> "$100M to <$1B", "$1B+"; "$5M-$20M" -> "$1M to <$10M", "$10M to <$50M"). Only when revenue is mentioned.
- fundingStages (only these keys: ${FUNDING_STAGE_OPTIONS.map((o) => `${o.key} = ${o.label}`).join('; ')}): only when funding is mentioned ("raised a Series A" -> series_a; "VC-backed"/"venture funded" -> seed, series_a, series_b, series_c_plus; "PE-backed" -> private_equity; "public companies" -> ipo).
- newInRoleMonths (${NEW_IN_ROLE_OPTIONS.map((o) => o.months).join(', ')} or 0): only when the user wants people new in their role; "in the last 3 months/90 days" -> 3, "last 6 months" -> 6, "last year/12 months" -> 12; "new in role"/"recently hired or promoted" with no period -> 6; a period in between -> the next longer option.
- personKeywords: only when the user asks for something in the person's LinkedIn profile/bio/About ("whose LinkedIn mentions outsourcing" -> "outsourcing"). Short, the user's own words.
- companyKeywords: only for a label-less niche (above) or when the user asks for something in the company's description ("companies that mention remote teams" -> "remote teams"). One short phrase. Never use it for an industry that has a label.
- isHiring: true only for "hiring now", "actively hiring", "growing their team", "has open roles".
- requireDirectDial: true only for "direct dial(s) only", "direct lines only".
- requirePhone / requireVerifiedEmail: true by default (the app's visible safe defaults). false only when the user says a phone (or email) is not needed, e.g. "email only" -> requirePhone false; "phone only"/"no email needed" -> requireVerifiedEmail false.
- suggestedFolderName: short list name (max 60 characters).
- interpretation: one or two plain sentences saying what will be searched and every judgement call (bands chosen for a range, industries mapped, defaults used, anything ignored). No markdown.

RULES:
- Add only constraints the user asked for or clearly implied. The only defaults are requirePhone and requireVerifiedEmail (true) and, when no people are described, the decision-maker seniority default. Do not invent industries, titles, keywords, sizes, revenue, funding or locations.
- When the request is vague, prefer the broader correct filter and explain it in interpretation.
- Empty list / "" / false / 0 for anything not asked for.

INDUSTRY LIST (exact labels): ${GETLEADS_INDUSTRIES.join(' | ')}`;

// ---------------------------------------------------------------------------------------------
// Sanitising: map onto allowed values, record every adjustment
// ---------------------------------------------------------------------------------------------

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const clip = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** A list from an array or a comma-separated string: trimmed, de-duplicated, capped. */
function list(v: unknown, max = 15, len = 80): string[] {
  const raw: unknown[] = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;\n]/) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    const s = clip(typeof x === 'number' ? String(x) : x, len).replace(/^["'\s]+|["'\s]+$/g, '');
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function mapSeniority(v: unknown, notes: string[]): string[] {
  const out = new Set<string>();
  for (const s of list(v, 10)) {
    const l = s.toLowerCase();
    const hit = SENIORITY_VALUES.find((x) => x.toLowerCase() === l);
    if (hit) out.add(hit);
    else if (/c-?suite|c-?level|chief|executive|cxo/.test(l)) out.add('C-Suite');
    else if (/\bvp\b|vice/.test(l)) out.add('VP');
    else if (/director|head/.test(l)) out.add('Director');
    else if (/owner|founder/.test(l)) out.add('Owner');
    else if (/partner/.test(l)) out.add('Partner');
    else if (/manager|lead\b/.test(l)) out.add('Manager');
    else notes.push(`Seniority "${s}" isn't a Lead Finder level, so it was left out.`);
  }
  return SENIORITY_VALUES.filter((x) => out.has(x));
}

const FUNCTION_SYNONYMS: [RegExp, string][] = [
  [/^(sales|business development|bizdev|revenue)$/, 'Sales & Business Development'],
  [/^(marketing|growth)$/, 'Marketing & Product Management'],
  [/^(operations|ops|supply chain)$/, 'Operations & Supply Chain'],
  [/^(finance|accounting)$/, 'Finance & Accounting'],
  [/^(hr|human resources|people|talent|people and culture)$/, 'Human Resources'],
  [/^(it|engineering|technology|tech)$/, 'Information Technology & Engineering'],
  [/^(customer (service|support|success|experience)|support|cx)$/, 'Customer Service & Support'],
  [/^(legal|compliance)$/, 'Legal & Compliance'],
];

function mapJobFunction(v: unknown, notes: string[]): string {
  const s = clip(v, 80);
  if (!s) return '';
  const n = norm(s);
  const exact = JOB_FUNCTION_OPTIONS.find((f) => norm(f) === n);
  if (exact) return exact;
  const syn = FUNCTION_SYNONYMS.find(([re]) => re.test(n));
  if (syn) return syn[1];
  const partial = JOB_FUNCTION_OPTIONS.find((f) => norm(f).startsWith(n) || n.startsWith(norm(f).split(' ')[0]));
  if (partial) return partial;
  notes.push(`Job function "${s}" isn't one Lead Finder can filter on, so it was left out.`);
  return '';
}

const INDUSTRY_BY_NORM = new Map(GETLEADS_INDUSTRIES.map((l) => [norm(l), l]));

/** Plain words -> industry labels, for near-misses from the model and the keyword fallback. */
export const INDUSTRY_ALIASES: [RegExp, string[]][] = [
  [/\bsaas\b|software/i, ['Software Development']],
  [/fin ?tech|financial services/i, ['Financial Services']],
  [/e-?commerce|online (retail|store|brand)|\bdtc\b|\bd2c\b|direct.to.consumer/i, ['Online and Mail Order Retail']],
  [/\bbpo\b|outsourc|offshor/i, ['Outsourcing and Offshoring Consulting']],
  [/call cent|contact cent/i, ['Telephone Call Centers']],
  [/logistic|supply chain|freight|\b3pl\b|trucking/i, [
    'Transportation; Logistics; Supply Chain and Storage', 'Truck Transportation',
    'Freight and Package Transportation', 'Warehousing and Storage',
  ]],
  [/health ?care|hospital|medical/i, ['Hospitals and Health Care', 'Medical Practices']],
  [/manufactur/i, ['Manufacturing']],
  [/real estate|propert|brokerage|realtor/i, ['Real Estate', 'Real Estate Agents and Brokers']],
  [/agenc|advertis|marketing/i, ['Advertising Services', 'Marketing Services']],
  [/executive search|headhunt/i, ['Executive Search Services']],
  [/staffing|recruit/i, ['Staffing and Recruiting']],
  [/it services|managed services|\bmsp\b|it consult/i, ['IT Services and IT Consulting']],
  [/insurance/i, ['Insurance']],
  [/law firm|legal/i, ['Law Practice', 'Legal Services']],
  [/accounting|accountan|bookkeep|\bcpa\b/i, ['Accounting']],
  [/construction|contractor/i, ['Construction']],
  [/hvac/i, ['HVAC and Refrigeration Equipment Manufacturing', 'Building Equipment Contractors']],
  [/solar|renewable/i, ['Renewable Energy Power Generation', 'Solar Electric Power Generation']],
  [/telecom/i, ['Telecommunications']],
  [/e-?learning|edtech/i, ['E-Learning Providers']],
  [/hospitality|hotel/i, ['Hospitality', 'Hotels and Motels']],
  [/\bbank/i, ['Banking']],
  [/consult/i, ['Business Consulting and Services']],
  [/retail (stores?|shops?|chains?|outlets?)|brick[- ]and[- ]mortar/i, ['Retail']],
  [/retail/i, ['Online and Mail Order Retail']],
];

/** Hub presets (the Industry dropdown's own options) are passed through unchanged. */
const INDUSTRY_PRESETS_NORM = new Set(
  [
    'Outsourcing / Offshoring (BPO)', 'Construction & Commercial HVAC', 'Computer Software & SaaS',
    'Renewables & Solar Energy', 'Telecommunications', 'Financial Services & FinTech',
    'Healthcare & Medical Devices', 'Real Estate & Property Management', 'Logistics & Supply Chain',
    'Marketing & Advertising Agencies',
  ].map(norm)
);

function mapIndustries(v: unknown, notes: string[], what: 'Industry' | 'Excluded industry'): string[] {
  const out = new Set<string>();
  for (const s of list(v, 12, 120)) {
    const n = norm(s);
    const exact = INDUSTRY_BY_NORM.get(n);
    if (exact) {
      out.add(exact);
      continue;
    }
    const alias = INDUSTRY_ALIASES.find(([re]) => re.test(s));
    if (alias) {
      alias[1].forEach((l) => out.add(l));
      notes.push(`${what} "${s}" was matched to ${alias[1].map((l) => `"${l}"`).join(', ')}.`);
      continue;
    }
    if (INDUSTRY_PRESETS_NORM.has(n)) {
      out.add(s);
      continue;
    }
    const words = n.split(' ').filter((w) => w.length >= 3 && !['and', 'the', 'for', 'services', 'companies'].includes(w));
    const fuzzy = words.length
      ? GETLEADS_INDUSTRIES.filter((label) => {
          const lw = norm(label).split(' ');
          return words.every((w) => lw.some((x) => x.startsWith(w)));
        })
          .sort((a, b) => a.length - b.length)
          .slice(0, 2)
      : [];
    if (fuzzy.length) {
      fuzzy.forEach((l) => out.add(l));
      notes.push(`${what} "${s}" was matched to ${fuzzy.map((l) => `"${l}"`).join(', ')}.`);
    } else {
      notes.push(`${what} "${s}" isn't an industry Lead Finder can filter on, so it was left out.`);
    }
  }
  return Array.from(out).slice(0, 10);
}

const COUNTRY_BY_LOWER = new Map(GETLEADS_COUNTRIES.map((c) => [c.toLowerCase(), c]));
const COUNTRY_ALIASES: Record<string, string[]> = {
  us: ['United States'], usa: ['United States'], 'u.s.': ['United States'], 'u.s.a.': ['United States'],
  america: ['United States'], 'united states of america': ['United States'], 'the us': ['United States'],
  uk: ['United Kingdom'], 'u.k.': ['United Kingdom'], england: ['United Kingdom'], britain: ['United Kingdom'],
  'great britain': ['United Kingdom'], scotland: ['United Kingdom'], wales: ['United Kingdom'], gb: ['United Kingdom'],
  au: ['Australia'], aus: ['Australia'], nz: ['New Zealand'], ca: ['Canada'], ph: ['Philippines'],
  uae: ['United Arab Emirates'], korea: ['South Korea'], czechia: ['Czech Republic'], holland: ['Netherlands'],
  'north america': ['United States', 'Canada'], anz: ['Australia', 'New Zealand'],
  dach: ['Germany', 'Austria', 'Switzerland'], nordics: ['Sweden', 'Norway', 'Denmark', 'Finland'],
};

function mapCountries(v: unknown, notes: string[]): string[] {
  const out = new Set<string>();
  for (const s of list(v, 15)) {
    const l = s.toLowerCase().replace(/^the\s+/, '');
    const hit = COUNTRY_BY_LOWER.get(l) || COUNTRY_BY_LOWER.get(s.toLowerCase());
    const alias = COUNTRY_ALIASES[l] || COUNTRY_ALIASES[s.toLowerCase()];
    if (hit) out.add(hit);
    else if (alias) alias.forEach((c) => out.add(c));
    else if (/^(global|worldwide|anywhere|any|all)$/.test(l)) continue;
    else notes.push(`Country "${s}" isn't a country name Lead Finder knows, so it was left out.`);
  }
  return Array.from(out);
}

export const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
export const AU_STATES: Record<string, string> = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', WA: 'Western Australia', SA: 'South Australia',
  TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory',
};
const US_STATE_NAMES = new Set(Object.values(US_STATES).map((s) => s.toLowerCase()));
const AU_STATE_NAMES = new Set(Object.values(AU_STATES).map((s) => s.toLowerCase()));

function mapStates(v: unknown, countries: string[]): string[] {
  const auOnly = countries.length > 0 && countries.every((c) => c === 'Australia');
  return list(v, 15).map((s) => {
    const up = s.toUpperCase();
    if (auOnly && AU_STATES[up]) return AU_STATES[up];
    return US_STATES[up] || AU_STATES[up] || s;
  });
}

/** Each requested size (band keys, labels or ranges) -> the union of bands it covers. */
function mapSizeBands(v: unknown, notes: string[]): string[] {
  const keys = new Set<string>();
  for (const s of list(v, 10)) {
    const hit = companySizeBandKeys(s);
    if (hit.length) hit.forEach((k) => keys.add(k));
    else notes.push(`Company size "${s}" couldn't be read, so any size is searched.`);
  }
  return SIZE_KEYS.filter((k) => keys.has(k));
}

const REVENUE_RANGES: [string, number, number][] = [
  ['<$1M', 0, 1], ['$1M to <$10M', 1, 10], ['$10M to <$50M', 10, 50], ['$50M to <$100M', 50, 100],
  ['$100M to <$1B', 100, 1000], ['$1B+', 1000, Infinity],
];

/** "$10M-$50M", "over $100M", "10 to 50 million" -> revenue bands (in $M). */
function moneyToBands(s: string): string[] {
  const t = s.toLowerCase().replace(/,/g, '');
  const num = (n: string, unit?: string) => {
    const x = Number(n);
    if (!unit) return x;
    if (/^b|billion/.test(unit)) return x * 1000;
    if (/^k|thousand/.test(unit)) return x / 1000;
    return x;
  };
  const re = /\$?\s*(\d+(?:\.\d+)?)\s*(k|thousand|m|mm|million|b|bn|billion)?/g;
  const nums = Array.from(t.matchAll(re)).map((m) => ({ v: num(m[1], m[2]), unit: m[2] }));
  if (!nums.length) return [];
  // "10-50M": the unit of the second number applies to the first.
  if (nums.length >= 2 && !nums[0].unit && nums[1].unit) nums[0].v = num(String(nums[0].v), nums[1].unit);
  let lo: number;
  let hi: number;
  if (/over|above|more than|\+|at least|greater/.test(t)) {
    lo = nums[0].v;
    hi = Infinity;
  } else if (/under|below|less than|<|up to/.test(t) && nums.length === 1) {
    lo = 0;
    hi = nums[0].v;
  } else if (nums.length >= 2) {
    lo = Math.min(nums[0].v, nums[1].v);
    hi = Math.max(nums[0].v, nums[1].v);
  } else {
    lo = nums[0].v;
    hi = nums[0].v;
  }
  return REVENUE_RANGES.filter(([, a, b]) => {
    if (lo === hi) return lo >= a && lo < b;
    return Math.min(hi, b) - Math.max(lo, a) > 0;
  }).map(([label]) => label);
}

function mapRevenue(v: unknown, notes: string[]): string[] {
  const out = new Set<string>();
  for (const s of list(v, 8)) {
    const exact = REVENUE_BAND_OPTIONS.find((b) => b.toLowerCase() === s.toLowerCase());
    if (exact) {
      out.add(exact);
      continue;
    }
    const bands = moneyToBands(s);
    if (bands.length) {
      bands.forEach((b) => out.add(b));
      notes.push(`Revenue "${s}" is searched as ${bands.join(', ')}.`);
    } else notes.push(`Revenue "${s}" couldn't be read, so any revenue is searched.`);
  }
  return REVENUE_BAND_OPTIONS.filter((b) => out.has(b));
}

function mapFunding(v: unknown, notes: string[]): string[] {
  const out = new Set<string>();
  for (const s of list(v, 8)) {
    const l = s.toLowerCase().replace(/[\s-]+/g, '_');
    const key = FUNDING_KEYS.find((k) => k === l);
    if (key) out.add(key);
    else if (/pre_?seed|angel/.test(l)) out.add('pre_seed');
    else if (/seed/.test(l)) out.add('seed');
    else if (/series_?a/.test(l)) out.add('series_a');
    else if (/series_?b/.test(l)) out.add('series_b');
    else if (/series_?[c-z]|series_?c_?plus|late/.test(l)) out.add('series_c_plus');
    else if (/private_?equity|\bpe\b|buyout/.test(l)) out.add('private_equity');
    else if (/ipo|public/.test(l)) out.add('ipo');
    else if (/vc|venture/.test(l)) ['seed', 'series_a', 'series_b', 'series_c_plus'].forEach((k) => out.add(k));
    else notes.push(`Funding stage "${s}" isn't one Lead Finder can filter on, so it was left out.`);
  }
  return FUNDING_KEYS.filter((k) => out.has(k));
}

function mapNewInRole(v: unknown, notes: string[]): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n <= 3) return 3;
  if (n <= 6) return 6;
  if (n > 12) notes.push(`"New in role" goes back at most 12 months, so the last 12 months are searched.`);
  return 12;
}

const sentence = (s: string) => (s && !/[.!?]$/.test(s) ? `${s}.` : s);

/** The user explicitly asked for physical retail (the only time plain "Retail" is right). */
const WANTS_PHYSICAL_RETAIL = /\bretail (stores?|shops?|chains?|outlets?|locations?)\b|\bbrick[- ]and[- ]mortar\b|\bphysical (stores?|shops?)\b|\bstorefronts?\b/i;

/**
 * B2B guard: the plain "Retail" industry is mostly physical shops (a consumer / local leak). Unless
 * the user asked for retail stores, it is replaced by "Online and Mail Order Retail" (e-commerce)
 * and the change is noted. Applied to every AI-built filter set, with the user's own words.
 */
export function guardPlainRetail(f: AiParsedFilters, userText: string): AiParsedFilters {
  const inds = f.industry.split(',').map((s) => s.trim()).filter(Boolean);
  if (!inds.includes('Retail') || WANTS_PHYSICAL_RETAIL.test(userText)) return f;
  const next = inds.filter((l) => l !== 'Retail');
  if (!next.includes('Online and Mail Order Retail')) next.push('Online and Mail Order Retail');
  return {
    ...f,
    industry: next.join(', '),
    notes: [...f.notes, 'Plain "Retail" (mostly physical shops) was replaced by "Online and Mail Order Retail" (e-commerce).'].slice(0, 8),
  };
}

/**
 * Model (or keyword-parser) output -> Lead Finder filters. Every value is mapped onto what Lead
 * Finder accepts; anything that could not be mapped is left out and explained in `notes`.
 */
export function sanitizeAiFilters(raw: Record<string, unknown>, source: 'ai' | 'keyword'): AiParsedFilters {
  const notes: string[] = [];
  const r = raw && typeof raw === 'object' ? raw : {};

  // Buying committee (brainstorm): every role's titles and levels are searched.
  const committee = cleanCommittee(r.committee).map((c) => ({ ...c, seniority: mapSeniority(c.seniority, notes) }));
  const titles = list([...committeeTitles(committee), ...list(r.titles, 30)], committee.length ? 30 : 15);
  const excludeTitles = list(r.excludeTitles, 15);
  const seniority = mapSeniority([...committee.flatMap((c) => c.seniority), ...list(r.seniority, 10)], notes);
  const department = mapJobFunction(r.jobFunction ?? r.department, notes);
  const industries = mapIndustries(r.industries ?? r.industry, notes, 'Industry');
  const excludeIndustries = mapIndustries(r.excludeIndustries, notes, 'Excluded industry').filter(
    (l) => !industries.includes(l)
  );

  const sizeKeys = mapSizeBands(r.companySizeBands ?? r.headcountRange, notes);
  const headcountRange = companySizeLabel(sizeKeys);
  if (sizeKeys.length > 1) {
    const labels = COMPANY_SIZE_BANDS.filter((b) => sizeKeys.includes(b.key)).map((b) => b.key);
    notes.push(`Company size is searched as LinkedIn's ${labels.join(', ')} employee bands (${headcountRange}).`);
  }

  let countries = mapCountries(r.countries ?? r.country, notes);
  const states = mapStates(r.states ?? r.state, countries);
  const cities = list(r.cities ?? r.city, 15);
  if (!countries.length && states.length) {
    if (states.every((s) => US_STATE_NAMES.has(s.toLowerCase()))) countries = ['United States'];
    else if (states.every((s) => AU_STATE_NAMES.has(s.toLowerCase()))) countries = ['Australia'];
  }
  if (!countries.length) {
    countries = [...DEFAULT_MARKETS];
    notes.push(`No location was given, so Lead Finder's default markets are searched: ${DEFAULT_MARKETS.join(', ')}.`);
  }

  const requireDirectDial = r.requireDirectDial === true;
  const filters: AiParsedFilters = {
    titles: titles.join(', '),
    excludeTitles: excludeTitles.join(', '),
    seniority,
    department,
    industry: industries.join(', '),
    excludeIndustries: excludeIndustries.join(', '),
    headcountRange,
    country: countries.join(', '),
    state: states.join(', '),
    city: cities.join(', '),
    technologies: list(r.technologies, 10).join(', '),
    revenue: mapRevenue(r.revenue, notes),
    fundingStages: mapFunding(r.fundingStages, notes),
    newInRoleMonths: mapNewInRole(r.newInRoleMonths, notes),
    personKeywords: clip(r.personKeywords, 120),
    companyKeywords: clip(r.companyKeywords, 120),
    requireDirectDial,
    isHiring: r.isHiring === true,
    requirePhone: requireDirectDial || r.requirePhone !== false,
    requireVerifiedEmail: r.requireVerifiedEmail !== false,
    suggestedFolderName: clip(r.suggestedFolderName, 60) || defaultFolderName(titles, industries),
    interpretation: sentence(clip(r.interpretation, 400)),
    notes: Array.from(new Set(notes)).slice(0, 8),
    committee,
    source,
  };
  return filters;
}

function defaultFolderName(titles: string[], industries: string[]): string {
  const who = titles[0] ? `${titles[0]}s` : 'Decision makers';
  return (industries[0] ? `${who} - ${industries[0]}` : `${who} - AI list`).slice(0, 60);
}

// ---------------------------------------------------------------------------------------------
// Keyword fallback (no AI available)
// ---------------------------------------------------------------------------------------------

const TITLE_RULES: [RegExp, string[], string][] = [
  [/\bceos?\b|chief executive/, ['CEO', 'Chief Executive Officer'], 'C-Suite'],
  [/\bco-?founders?\b|\bfounders?\b/, ['Founder', 'Co-Founder'], 'Owner'],
  [/\bowners?\b/, ['Owner', 'Co-Owner'], 'Owner'],
  [/\bcoos?\b|chief operat/, ['COO', 'Chief Operating Officer'], 'C-Suite'],
  [/\bcfos?\b|chief financ/, ['CFO', 'Chief Financial Officer'], 'C-Suite'],
  [/\bctos?\b|chief tech/, ['CTO', 'Chief Technology Officer'], 'C-Suite'],
  [/\bcmos?\b|chief marketing/, ['CMO', 'Chief Marketing Officer'], 'C-Suite'],
  [/\bcros?\b|chief revenue/, ['CRO', 'Chief Revenue Officer'], 'C-Suite'],
  [/\bpresidents?\b/, ['President'], 'C-Suite'],
  [/managing directors?/, ['Managing Director'], 'Director'],
  [/\bvps? (of )?sales\b|vice presidents? of sales/, ['VP of Sales', 'Vice President of Sales'], 'VP'],
  [/\bvps? (of )?operations\b/, ['VP of Operations', 'Vice President of Operations'], 'VP'],
  [/\bmanaging partners?\b/, ['Managing Partner'], 'Partner'],
];

const FUNCTION_WORDS: [RegExp, string][] = [
  [/\b(hr|human resources|people)\b/, 'Human Resources'],
  [/\boperations?\b|\bops\b/, 'Operations & Supply Chain'],
  [/customer (support|service|success|experience)|\bcx\b/, 'Customer Service & Support'],
  [/\bsales\b/, 'Sales & Business Development'],
  [/\bfinance\b/, 'Finance & Accounting'],
  [/\bmarketing\b/, 'Marketing & Product Management'],
];

const CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Dallas', 'Austin', 'San Francisco', 'Seattle', 'Boston',
  'Miami', 'Atlanta', 'Denver', 'Phoenix', 'San Diego', 'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
  'London', 'Manchester', 'Birmingham', 'Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Auckland', 'Manila',
  'Cebu', 'Singapore', 'Dubai',
];

export function keywordParse(prompt: string): AiParsedFilters {
  const p = prompt.toLowerCase();
  const titles: string[] = [];
  const seniority = new Set<string>();
  for (const [re, t, level] of TITLE_RULES) {
    if (re.test(p)) {
      titles.push(...t);
      seniority.add(level);
    }
  }
  const head = p.match(/\bheads? of ([a-z ]+?)(?:\s+(?:at|in|for|from|who|with)\b|[,.;]|$)/);
  if (head) {
    titles.push(`Head of ${head[1].replace(/\b\w/g, (c) => c.toUpperCase())}`);
    seniority.add('Director');
    seniority.add('VP');
  }
  let jobFunction = '';
  if (!titles.length && /\b(leaders?|leadership|directors?|managers?|executives?|heads)\b/.test(p)) {
    jobFunction = FUNCTION_WORDS.find(([re]) => re.test(p))?.[1] || '';
    if (/\bdirectors?\b/.test(p)) seniority.add('Director');
    if (/\bmanagers?\b/.test(p)) seniority.add('Manager');
    if (/\bleaders?|leadership|heads\b/.test(p)) ['C-Suite', 'VP', 'Director'].forEach((s) => seniority.add(s));
    if (/\bexecutives?\b/.test(p)) ['C-Suite', 'VP'].forEach((s) => seniority.add(s));
  }
  if (/\bvps?\b|vice president/.test(p)) seniority.add('VP');
  if (!titles.length && !seniority.size) ['C-Suite', 'Owner', 'VP', 'Director'].forEach((s) => seniority.add(s));

  // Exclusions: "exclude interns and assistants", "no assistants".
  const excludeTitles: string[] = [];
  const exclusion = p.match(/\b(?:exclude|excluding|no|not|without)\s+([a-z ,&]+?)(?:[;.]|$)/g) || [];
  for (const chunk of exclusion) {
    for (const [re, t] of [[/intern/, 'Intern'], [/assistant/, 'Assistant'], [/student/, 'Student'], [/freelanc/, 'Freelancer'], [/junior/, 'Junior']] as const) {
      if (re.test(chunk)) excludeTitles.push(t);
    }
  }
  const excludeIndustries = /\b(no|exclude|excluding|not|without)\s+(marketing |ad |digital )?agenc/.test(p)
    ? ['Advertising Services', 'Marketing Services']
    : [];

  // Industries (skip agency words that were an exclusion).
  const industryText = excludeIndustries.length ? p.replace(/\b(no|exclude|excluding|not|without)\s+(marketing |ad |digital )?agenc\w*/g, '') : p;
  // Label-less niches search the company description instead of a near-empty industry label.
  const niche = /fin ?tech/.test(industryText) ? 'fintech' : /e-?commerce|\bdtc\b|\bd2c\b|online (brand|store)s?/.test(industryText) ? 'e-commerce' : '';
  const industries = new Set<string>();
  for (const [re, labels] of INDUSTRY_ALIASES) {
    if (!re.test(industryText)) continue;
    if (niche === 'fintech' && labels[0] === 'Financial Services') continue;
    if (niche === 'e-commerce' && labels[0] === 'Online and Mail Order Retail') continue;
    labels.forEach((l) => industries.add(l));
  }

  // Size.
  let sizeBands: string[] = [];
  const range = p.match(/(\d[\d,]*)\s*(?:-|–|—|to)\s*(\d[\d,]*)\s*(?:\+\s*)?(?:employees?|people|staff|seats?|person|-person|headcount)/);
  const over = p.match(/(?:over|more than|above|at least)\s*(\d[\d,]*)\s*(?:employees?|people|staff|seats?)/) || p.match(/(\d[\d,]*)\s*\+\s*(?:employees?|people|staff|seats?)/);
  const under = p.match(/(?:under|fewer than|less than|below)\s*(\d[\d,]*)\s*(?:employees?|people|staff|seats?)/);
  if (range) sizeBands = companySizeBandKeys(`${range[1]}-${range[2]}`);
  else if (over) sizeBands = companySizeBandKeys(`${over[1]}+`);
  else if (under) sizeBands = companySizeBandKeys(`1-${under[1]}`);
  else if (/\bsmbs?\b|small (and medium|businesses|companies)/.test(p)) sizeBands = ['11-50', '51-200'];
  else if (/\bstartups?\b/.test(p)) sizeBands = ['1-10', '11-50'];
  else if (/mid-?(market|sized?)/.test(p)) sizeBands = ['51-200', '201-500', '501-1000'];
  else if (/\benterprise|large (companies|enterprises)/.test(p)) sizeBands = ['1001-5000', '5001-10000', '10001+'];

  // Revenue.
  const revenue: string[] = [];
  const rev = p.match(/(?:over|above|more than|under|below|less than)?\s*\$\s*\d[\d.,]*\s*(?:k|m|mm|million|b|bn|billion)?(?:\s*(?:-|–|to)\s*\$?\s*\d[\d.,]*\s*(?:k|m|mm|million|b|bn|billion)?)?\+?(?=\s*(?:in )?(?:revenue|arr|sales|turnover|a year|annual))?/);
  if (rev && /revenue|arr|turnover|doing \$|\$\d/.test(p)) revenue.push(rev[0].trim());

  const funding: string[] = [];
  for (const m of p.matchAll(/\b(pre-?seed|seed|series [a-z]|private equity|pe-backed|vc-backed|venture[- ]backed|ipo|publicly traded)\b/g)) funding.push(m[1]);

  let newInRoleMonths = 0;
  if (/new (in|to) (their |the )?role|recently (hired|promoted|joined|started)|just started|new hires?\b/.test(p)) {
    const m = p.match(/last (\d+) (months?|days?)/);
    newInRoleMonths = m ? (m[2].startsWith('day') ? Math.ceil(Number(m[1]) / 30) : Number(m[1])) : 6;
    if (/last (year|12 months)/.test(p)) newInRoleMonths = 12;
  }

  const countries: string[] = [];
  for (const c of GETLEADS_COUNTRIES) {
    if (c.length > 3 && new RegExp(`\\b${c.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(p) && !(c === 'Georgia' && /\bgeorgia\b/.test(p) && /\b(us|usa|united states|america)\b/.test(p))) countries.push(c);
  }
  if (/\b(us|usa|u\.s\.|america|american)\b/.test(p)) countries.push('United States');
  if (/\b(uk|britain|british|england)\b/.test(p)) countries.push('United Kingdom');
  if (/\b(aussie|australian)\b/.test(p)) countries.push('Australia');
  if (/\bcanadian\b/.test(p)) countries.push('Canada');
  if (/\banz\b/.test(p)) countries.push('Australia', 'New Zealand');
  if (/north america/.test(p)) countries.push('United States', 'Canada');

  const states = [...Object.values(US_STATES), ...Object.values(AU_STATES)].filter((s) =>
    new RegExp(`\\b${s.toLowerCase()}\\b`).test(p) && !(s === 'Georgia' && countries.includes('Georgia'))
  );
  const cities = CITIES.filter((c) => new RegExp(`\\b${c.toLowerCase()}\\b`).test(p));
  const statesInAu = states.filter((s) => AU_STATE_NAMES.has(s.toLowerCase()));
  if (cities.some((c) => ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide'].includes(c)) || statesInAu.length) countries.push('Australia');

  const bio = p.match(/(?:linkedin|bio|profile|about)[^.]*?\b(?:mentions?|says?|includes?|contains?|with)\s+["']?([a-z0-9 &-]{3,40}?)["']?(?:[,.;]|$|\s+(?:and|in|at|from|us|uk)\b)/);

  return sanitizeAiFilters(
    {
      titles,
      excludeTitles,
      seniority: Array.from(seniority),
      jobFunction,
      industries: Array.from(industries),
      excludeIndustries,
      companySizeBands: sizeBands,
      countries: Array.from(new Set(countries)),
      states,
      cities,
      revenue,
      fundingStages: funding,
      newInRoleMonths,
      personKeywords: bio ? bio[1].trim() : '',
      companyKeywords: niche,
      isHiring: /\b(hiring|open roles|growing (their|the) team)\b/.test(p),
      requireDirectDial: /direct[- ]?(dial|line)s?\b/.test(p),
      requirePhone: !/no phone|without (a )?phone|phone (not|isn't) needed|email only/.test(p),
      requireVerifiedEmail: !/no email|without (an )?email|email (not|isn't) needed|phone only/.test(p),
      interpretation: 'Parsed with built-in keyword rules (AI unavailable). Please review the filters.',
    },
    'keyword'
  );
}

// ---------------------------------------------------------------------------------------------
// One JSON-only model call (Gemini REST shape; the Anthropic bridge answers it in production)
// ---------------------------------------------------------------------------------------------

export interface GenerateJsonInput {
  system: string;
  /** Text parts; inlineData parts carry a file (e.g. a PDF) for models that read files. */
  contents: { role: 'user' | 'model'; parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] }[];
  schema: unknown;
  maxOutputTokens?: number;
  timeoutMs?: number;
  tag: string;
}

/** The parsed JSON reply, or null when no model could answer (the caller falls back). */
export async function generateJson(input: GenerateJsonInput): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  const models = process.env.GEMINI_MODEL
    ? [process.env.GEMINI_MODEL]
    : ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.6-flash'];
  for (const model of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(input.timeoutMs ?? 45_000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: input.contents,
          generationConfig: {
            temperature: 0,
            maxOutputTokens: input.maxOutputTokens ?? 2048,
            responseMimeType: 'application/json',
            responseSchema: input.schema,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const text: string = (data?.candidates?.[0]?.content?.parts || [])
        .map((p: { text?: string }) => p.text || '')
        .join('')
        .trim();
      if (!text) throw new Error('empty response');
      const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      throw new Error('not a JSON object');
    } catch (err) {
      console.warn(`[${input.tag}] model ${model} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

/** Token bucket per person for AI routes: a burst of `burst`, refilling `perMinute` a minute. */
const g = globalThis as typeof globalThis & { __appyAiRate?: Map<string, { tokens: number; at: number }> };
const rate = (g.__appyAiRate ??= new Map());

export function aiRateLimited(key: string, burst = 8, perMinute = 12): number {
  const now = Date.now();
  const cur = rate.get(key) ?? { tokens: burst, at: now };
  const tokens = Math.min(burst, cur.tokens + ((now - cur.at) / 60_000) * perMinute);
  if (tokens < 1) {
    rate.set(key, { tokens, at: now });
    return Math.max(1, Math.ceil(((1 - tokens) * 60) / perMinute));
  }
  rate.set(key, { tokens: tokens - 1, at: now });
  if (rate.size > 5000) for (const [k, v] of rate) if (now - v.at > 600_000) rate.delete(k);
  return 0;
}
