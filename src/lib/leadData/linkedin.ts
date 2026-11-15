/**
 * LinkedIn URL normalisation. Client-safe: used when pulled leads are saved and wherever a lead's
 * LinkedIn link is shown, so a link is always the person's own profile (never their company page,
 * a school, a post or a tracking link) and a lead without one shows no link at all.
 */

const LINKEDIN_HOST = /^(?:[a-z]{2,3}\.|www\.|m\.)?linkedin\.com$/i;
/** A profile slug: letters, digits, dashes, underscores, dots and %-escapes (non-ASCII names). */
const SLUG = /^[A-Za-z0-9\-_.%~]{2,120}$/;

function parse(raw: unknown): URL | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, '')}`;
  try {
    const u = new URL(s);
    return LINKEDIN_HOST.test(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

function slugAfter(u: URL, section: string): string {
  const parts = u.pathname.split('/').filter(Boolean);
  const i = parts.findIndex((p) => p.toLowerCase() === section);
  if (i !== 0 || !parts[1]) return '';
  const slug = parts[1];
  return SLUG.test(slug) ? slug : '';
}

/**
 * `https://www.linkedin.com/in/<slug>` for a personal profile URL (any LinkedIn host, with or
 * without protocol, tracking parameters, trailing paths like /details/experience or a locale),
 * or '' when it is not a personal profile (company, school, showcase, post, job, Sales Navigator,
 * another site, or empty).
 */
export function normalizeLinkedinProfileUrl(raw: unknown): string {
  const u = parse(raw);
  if (!u) return '';
  const slug = slugAfter(u, 'in');
  return slug ? `https://www.linkedin.com/in/${slug}` : '';
}

/** `https://www.linkedin.com/company/<slug>` for a company page URL, or ''. */
export function normalizeLinkedinCompanyUrl(raw: unknown): string {
  const u = parse(raw);
  if (!u) return '';
  const slug = slugAfter(u, 'company');
  return slug ? `https://www.linkedin.com/company/${slug}` : '';
}
