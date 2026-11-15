/**
 * Buying committee: the role groups (Decision maker, Champion, Influencer) a Lead Finder search can
 * target at the same companies. Client-safe: used by the brainstorm, the Lead Finder UI and the
 * provider (to tag each pulled lead with the role its title matches).
 */
import type { BuyingCommitteeRole } from './types';

export const COMMITTEE_ROLES = ['Decision maker', 'Champion', 'Influencer'] as const;
/** Most people per company when a committee is set (and never fewer than the default 2). */
export const MAX_COMMITTEE_PER_COMPANY = 3;

/** Spelled-out C-level titles -> their acronyms, so "Chief Executive Officer" matches "CEO". */
const CHIEF: [RegExp, string][] = [
  [/\bchief executive officer\b/g, 'ceo'],
  [/\bchief operating officer\b/g, 'coo'],
  [/\bchief operations officer\b/g, 'coo'],
  [/\bchief financial officer\b/g, 'cfo'],
  [/\bchief technology officer\b/g, 'cto'],
  [/\bchief marketing officer\b/g, 'cmo'],
  [/\bchief revenue officer\b/g, 'cro'],
  [/\bchief information officer\b/g, 'cio'],
  [/\bchief human resources officer\b/g, 'chro'],
  [/\bchief people officer\b/g, 'cpo'],
  [/\bchief customer officer\b/g, 'cco'],
];

const norm = (s: string) =>
  ` ${CHIEF.reduce((acc, [re, short]) => acc.replace(re, short), s.toLowerCase())
    .replace(/&/g, ' and ')
    .replace(/\bvice president\b/g, 'vp')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(of|the|for)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

/** "Owner" in these titles is a job, not ownership of the company (e.g. Product Owner). */
const NOT_AN_OWNER = /\b(product|process|business|account|project|data|asset|content|service|system|platform)\s+owner\b/i;

/** Clean, de-duplicated committee (at most 3 roles, 10 titles each); [] when none. */
export function cleanCommittee(raw: unknown): BuyingCommitteeRole[] {
  if (!Array.isArray(raw)) return [];
  const out: BuyingCommitteeRole[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const role = typeof o.role === 'string' ? o.role.trim().slice(0, 40) : '';
    const titles = Array.isArray(o.titles)
      ? Array.from(
          new Set(
            o.titles
              .filter((t): t is string => typeof t === 'string')
              .map((t) => t.trim().slice(0, 80))
              .filter(Boolean)
          )
        ).slice(0, 10)
      : [];
    const seniority = Array.isArray(o.seniority)
      ? o.seniority.filter((s): s is string => typeof s === 'string' && Boolean(s.trim())).slice(0, 6)
      : [];
    if (!role || !titles.length || out.some((x) => x.role.toLowerCase() === role.toLowerCase())) continue;
    out.push({ role, titles, seniority });
    if (out.length >= COMMITTEE_ROLES.length) break;
  }
  return out;
}

/** Acronym titles and their usual spelled-out form (both are searched). */
const SPELLED: Record<string, string> = {
  CEO: 'Chief Executive Officer',
  COO: 'Chief Operating Officer',
  CFO: 'Chief Financial Officer',
  CTO: 'Chief Technology Officer',
  CMO: 'Chief Marketing Officer',
  CRO: 'Chief Revenue Officer',
  CIO: 'Chief Information Officer',
  CHRO: 'Chief Human Resources Officer',
};

/**
 * Every committee title, in role order, de-duplicated (what the title filter searches), plus the
 * usual spelling variants ("CEO" also searches "Chief Executive Officer", "VP of X" also
 * "Vice President of X", "Founder" also "Co-Founder").
 */
export function committeeTitles(committee: BuyingCommitteeRole[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (t: string) => {
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  };
  for (const r of committee) for (const t of r.titles) add(t);
  for (const r of committee) {
    for (const t of r.titles) {
      const spelled = SPELLED[t.trim().toUpperCase()];
      if (spelled) add(spelled);
      const vp = t.match(/^VP (of )?(.+)$/i);
      if (vp) add(`Vice President of ${vp[2]}`);
      if (/^founder$/i.test(t.trim())) add('Co-Founder');
    }
  }
  return out.slice(0, 30);
}

/**
 * The committee role a job title belongs to: the role with a title whose words all appear in it
 * (any order: "Operations Director" matches "Director of Operations"; "Chief Executive Officer"
 * matches "CEO"); the most specific match wins. '' when none matches.
 */
export function committeeRoleFor(title: string, committee: BuyingCommitteeRole[] | undefined): string {
  if (!committee?.length || !title) return '';
  const words = new Set(norm(title).trim().split(' '));
  const notOwner = NOT_AN_OWNER.test(title);
  let best = '';
  let bestLen = 0;
  for (const r of committee) {
    for (const ct of r.titles) {
      const c = norm(ct).trim();
      if (!c || (notOwner && c === 'owner')) continue;
      const need = c.split(' ');
      if (need.every((w) => words.has(w)) && c.length > bestLen) {
        best = r.role;
        bestLen = c.length;
      }
    }
  }
  return best;
}

/** People per company to ask the provider for: the committee size, 2 to 3. */
export function committeePerCompany(committee: BuyingCommitteeRole[] | undefined, fallback: number): number {
  if (!committee?.length) return fallback;
  return Math.max(fallback, Math.min(MAX_COMMITTEE_PER_COMPANY, committee.length));
}
