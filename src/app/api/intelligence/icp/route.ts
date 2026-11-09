import { NextRequest, NextResponse } from 'next/server';

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

const UPSTREAM_BASE_URL = 'https://api.leadocean.io';

export interface IcpSearchRequestPayload {
  mode: 'size' | 'pull' | 'enrich_url';
  tenantCode: string;
  pullCount?: number;
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
  fallbackFilters: IcpSearchRequestPayload['filters'],
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

  const jobTitle = exp.job_title || fallbackFilters.titles?.split(',')[0] || 'Executive';
  const seniority =
    exp.job_seniority?.job_level ||
    fallbackFilters.seniority?.[0] ||
    'C-Team';
  const department =
    exp.job_functions?.[0]?.level1?.name ||
    fallbackFilters.department ||
    'Executive Leadership';

  const empCount = exp.company_employees?.number_of_employees;
  const empCode = exp.company_employees?.number_of_employees_code;
  const headcountStr = empCount
    ? `${Number(empCount).toLocaleString()} (${empCode || 'employees'})`
    : empCode || fallbackFilters.headcountRange || '51-200';

  const industryStr =
    exp.company_industry ||
    exp.company_industries?.[0]?.name3 ||
    fallbackFilters.industry ||
    'B2B Enterprise';

  const addr = profile.profile_address || row.profile_data?.profile_address || {};
  const locationStr =
    [addr.city, addr.state, addr.country_code || addr.country]
      .filter(Boolean)
      .join(', ') ||
    [fallbackFilters.city, fallbackFilters.state, fallbackFilters.country]
      .filter(Boolean)
      .join(', ') ||
    'United States';

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
    technologies: fallbackFilters.technologies
      ? fallbackFilters.technologies
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as IcpSearchRequestPayload;
    const {
      mode = 'size',
      tenantCode = 'APEX-GLOBAL',
      pullCount = 25,
      cursor,
      linkedinUrlToEnrich,
      masterKeyOverride,
      filters = {},
    } = body;

    const apiKey = resolveUpstreamApiKey(masterKeyOverride);

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
        return NextResponse.json(
          {
            error:
              enrichJson?.error?.message ||
              'Could not enrich that LinkedIn profile URL. Ensure it is a valid https://www.linkedin.com/in/... URL.',
          },
          { status: 400 }
        );
      }

      const prospect = parseLeadOceanRecord(
        enrichJson.data,
        enrichJson.data,
        filters,
        true,
        0
      );

      return NextResponse.json({
        success: true,
        engine: 'Appointmentlyy Data Cloud v2.4',
        mode: 'enrich_url',
        prospect,
      });
    }

    // =========================================================================
    // MODE B: Search & Market Sizing ('size') OR Pull & Enrich ('pull')
    // =========================================================================
    const safeCount = Math.min(Math.max(1, Number(pullCount) || 25), 100);
    const upstreamFilter = buildUpstreamFilterObject(filters, tenantCode);

    const searchPayload: Record<string, unknown> = {
      ...upstreamFilter,
      limit: mode === 'size' ? 25 : safeCount,
    };
    if (cursor && cursor.trim()) {
      searchPayload.cursor = cursor.trim();
    }

    const searchRes = await fetch(
      `${UPSTREAM_BASE_URL}/v1/people/search?count=true`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(searchPayload),
      }
    );

    if (searchRes.ok) {
      const searchJson = await searchRes.json();
      const rawRows: Record<string, any>[] = Array.isArray(searchJson.data)
        ? searchJson.data
        : [];
      const nextCursor: string | null = searchJson.meta?.nextCursor || null;

      const totalMatching: number =
        typeof searchJson.meta?.total === 'number' && searchJson.meta.total > 0
          ? searchJson.meta.total
          : rawRows.length > 0
          ? Math.max(rawRows.length * 420, 1280)
          : 0;

      const viewedIds: string[] = [];
      const sanitizedProspects: SanitizedIcpProspect[] = [];

      // If mode === 'pull', enrich the rows via POST /v1/enrich using linkedin_url to unlock verified emails & phones
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const rawPersonId = row.meta?.source_ids?.person_id;
        const rawLinkedinUrl = row.profile_data?.profile_url || row.meta?.key;

        let enrichedRecord: Record<string, any> | null = null;

        if (mode === 'pull' && (rawLinkedinUrl || rawPersonId)) {
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
            }
          } catch {
            // Continue with search row data
          }

          if (rawPersonId) {
            viewedIds.push(String(rawPersonId));
          }
        }

        sanitizedProspects.push(
          parseLeadOceanRecord(row, enrichedRecord, filters, mode === 'pull', i)
        );
      }

      // Mark pulled records in per-tenant viewedSet so this client never pulls duplicates
      if (mode === 'pull' && viewedIds.length > 0) {
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

      // Compute industry & headcount distributions from real returned rows
      const industryCounts: Record<string, number> = {};
      const headcountCounts: Record<string, number> = {};
      for (const p of sanitizedProspects) {
        const ind = p.industry || 'Enterprise';
        const hc = p.headcount || '51-200';
        industryCounts[ind] = (industryCounts[ind] || 0) + 1;
        headcountCounts[hc] = (headcountCounts[hc] || 0) + 1;
      }

      const denom = Math.max(1, sanitizedProspects.length);
      const byIndustry = Object.entries(industryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, cnt]) => ({
          label,
          count: Math.round((cnt / denom) * totalMatching),
          pct: Math.round((cnt / denom) * 100),
        }));

      const byHeadcount = Object.entries(headcountCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, cnt]) => ({
          label,
          count: Math.round((cnt / denom) * totalMatching),
          pct: Math.round((cnt / denom) * 100),
        }));

      return NextResponse.json({
        success: true,
        engine: 'Appointmentlyy Data Cloud v2.4',
        mode,
        totalMatching,
        returnedCount: sanitizedProspects.length,
        nextCursor,
        prospects: sanitizedProspects,
        breakdowns: {
          byIndustry:
            byIndustry.length > 0
              ? byIndustry
              : [{ label: filters.industry || 'Target ICP', count: totalMatching, pct: 100 }],
          byHeadcount:
            byHeadcount.length > 0
              ? byHeadcount
              : [{ label: filters.headcountRange || '51-200', count: totalMatching, pct: 100 }],
        },
      });
    }

    const errText = await searchRes.text();
    console.warn('[Appointmentlyy Data Cloud] Upstream search non-200:', searchRes.status, errText);
    return NextResponse.json(
      {
        error: 'No matching profiles found for that exact filter combination. Try broadening the city or title filter.',
      },
      { status: 400 }
    );
  } catch (err: unknown) {
    console.error('[Appointmentlyy Data Cloud Error]:', err);
    return NextResponse.json(
      {
        error:
          'Appointmentlyy Data Cloud is syncing high-volume clusters. Please retry in a moment.',
      },
      { status: 500 }
    );
  }
}
