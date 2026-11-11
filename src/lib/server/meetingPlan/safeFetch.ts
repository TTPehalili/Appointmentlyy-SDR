/**
 * SSRF-safe website reader for Meeting Action Plans (server only).
 *
 * Reads a company's public website so the AI can research it. Every URL (including each redirect hop) is
 * checked: http/https only, no credentials, ports 80/443 only, no IP literals or local hostnames, no
 * LinkedIn, and every DNS answer must be a public address. Responses are size- and time-limited and only
 * HTML is read. No new dependencies: HTML is turned into text with a few careful regexes.
 *
 * Known v1 gap (accepted): DNS rebinding. We resolve the host with dns.lookup and then let fetch resolve
 * it again, so a hostile DNS server could answer differently between the two lookups (TOCTOU). Pinning
 * the resolved address would need a custom undici dispatcher; revisit if this reader is ever exposed to
 * arbitrary user-supplied URLs at scale.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 3;
const TOTAL_TIMEOUT_MS = 8000;
const MAX_BYTES = 1.5 * 1024 * 1024;
const PAGE_TEXT_CAP = 12000;
const COMBINED_TEXT_CAP = 20000;
const MAX_LINKS = 250;

/** Generic browser-like UA that identifies as a bot. No personal or account info, ever. */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 (compatible; CompanyResearchBot/1.0)';

export interface PageText {
  url: string;
  title: string;
  description: string;
  text: string;
  links: { href: string; text: string }[];
}

// ---------------------------------------------------------------------------------------------------
// Address checks
// ---------------------------------------------------------------------------------------------------

function ipv4Parts(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
}

function isPublicV4(p: number[]): boolean {
  const [a, b, c] = p;
  if (a === 0) return false; // 0.0.0.0/8 "this network" / unspecified
  if (a === 10) return false; // private
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64/10
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local (incl. cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 0 && c === 0) return false; // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return false; // TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay anycast
  if (a === 192 && b === 168) return false; // private
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast 224/4, reserved 240/4, broadcast
  return true;
}

/** Expand an IPv6 string to 8 16-bit groups (handles "::" and a trailing dotted IPv4). */
function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase();
  // Rewrite a trailing dotted IPv4 as two hex groups: "::ffff:127.0.0.1" -> "::ffff:7f00:1".
  const lastColon = s.lastIndexOf(':');
  const last = s.slice(lastColon + 1);
  if (last.includes('.')) {
    const v4 = ipv4Parts(last);
    if (!v4) return null;
    s = `${s.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(':') : []).map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  if ([...head, ...rest].some((n) => Number.isNaN(n))) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - rest.length;
  if (fill < 1) return null;
  return [...head, ...new Array<number>(fill).fill(0), ...rest];
}

/**
 * True only for globally routable unicast addresses. Rejects private, loopback, link-local, CGNAT,
 * multicast, unspecified, documentation/benchmark ranges, IPv6 ULA/site-local, and IPv4 addresses
 * embedded in IPv6 (mapped, compatible, NAT64, 6to4) that are themselves non-public.
 */
export function isPublicAddress(address: string): boolean {
  if (!address) return false;
  const ip = address.trim().replace(/^\[|\]$/g, '').split('%')[0];
  const kind = isIP(ip);
  if (kind === 4) {
    const p = ipv4Parts(ip);
    return !!p && isPublicV4(p);
  }
  if (kind !== 6) return false;
  const g = ipv6Groups(ip);
  if (!g) return false;
  const embeddedV4 = (hi: number, lo: number) => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];

  if (g.every((x) => x === 0)) return false; // :: unspecified
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1 loopback
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPublicV4(embeddedV4(g[6], g[7])); // ::ffff:a.b.c.d
  if (g.slice(0, 6).every((x) => x === 0)) return false; // ::a.b.c.d (deprecated IPv4-compatible)
  if (g[0] === 0x64 && g[1] === 0xff9b) return isPublicV4(embeddedV4(g[6], g[7])); // NAT64 64:ff9b::/96 (+ /48 local)
  if (g[0] === 0x2002) return isPublicV4(embeddedV4(g[1], g[2])); // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return false; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo (tunnels to arbitrary IPv4)
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return false; // discard-only 100::/64
  if ((g[0] & 0xe000) !== 0x2000) return false; // only 2000::/3 is global unicast
  return true;
}

// ---------------------------------------------------------------------------------------------------
// URL checks
// ---------------------------------------------------------------------------------------------------

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet', '.corp', '.localdomain'];

/** LinkedIn is never fetched (terms + it is only ever a search hint). */
export function isLinkedinHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return h === 'linkedin.com' || h.endsWith('.linkedin.com') || h === 'lnkd.in' || h.endsWith('.lnkd.in') || h === 'licdn.com' || h.endsWith('.licdn.com');
}

/** Static checks on a parsed URL (no DNS). Returns the reason it's refused, or null when OK. */
function urlProblem(u: URL): string | null {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'scheme';
  if (u.username || u.password) return 'credentials';
  if (u.port && u.port !== '80' && u.port !== '443') return 'port';
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return 'host';
  if (isIP(host.replace(/^\[|\]$/g, ''))) return 'ip-literal';
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return 'local-host';
  if (!host.includes('.')) return 'single-label-host';
  if (!/^[a-z0-9.-]+$/.test(host) || host.split('.').some((l) => !l || l.length > 63 || l.startsWith('-') || l.endsWith('-'))) return 'bad-host';
  if (/^\d+$/.test(host.split('.').pop() || '')) return 'numeric-tld'; // e.g. "0x7f.1" style tricks
  if (isLinkedinHost(host)) return 'linkedin';
  return null;
}

/**
 * Normalise what a rep or admin typed ("acme.com", "www.acme.com/about", "https://acme.com/?x=1") into
 * "https://acme.com" or "https://www.acme.com/about" (scheme kept when given, https otherwise; query and
 * fragment dropped; trailing slash trimmed). Returns null for anything we won't fetch.
 */
export function normalizeWebsite(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s || s.length > 2048 || /\s/.test(s)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    if (!/^https?:\/\//i.test(s)) return null;
  } else if (s.startsWith('//')) {
    s = 'https:' + s;
  } else if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) {
    return null; // mailto:, javascript:, data:, file: ... (but not "acme.com:443")
  } else {
    s = 'https://' + s;
  }
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (urlProblem(u)) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const port = u.port ? `:${u.port}` : '';
  const path = u.pathname.replace(/\/+$/, '');
  return `${u.protocol}//${host}${port}${path}`;
}

/** Validate a URL for fetching: static checks + every DNS answer must be public. */
async function checkFetchable(raw: string): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (urlProblem(u)) return null;
  u.hash = '';
  try {
    const answers = await lookup(u.hostname, { all: true, verbatim: true });
    if (!answers.length || answers.some((a) => !isPublicAddress(a.address))) return null;
  } catch {
    return null;
  }
  return u;
}

// ---------------------------------------------------------------------------------------------------
// HTML -> text
// ---------------------------------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', reg: '®', trade: '™', bull: '•',
  middot: '·', laquo: '«', raquo: '»', euro: '€', pound: '£', yen: '¥', cent: '¢', deg: '°',
  times: '×', divide: '÷', eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', ouml: 'ö', uuml: 'ü',
  auml: 'ä', ntilde: 'ñ', ccedil: 'ç', shy: '', zwj: '', zwnj: '', thinsp: ' ', ensp: ' ', emsp: ' ',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,15});?/gi, (m, body: string) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return ' ';
      if (cp < 32 && cp !== 9 && cp !== 10 && cp !== 13) return ' ';
      return String.fromCodePoint(cp);
    }
    const v = NAMED_ENTITIES[body.toLowerCase()];
    return v !== undefined ? v : m;
  });
}

const cleanInline = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function attr(tag: string, name: string): string {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').trim() : '';
}

const stripBlocks = (html: string, tags: string[]) =>
  tags.reduce((h, t) => h.replace(new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?<\\/${t}\\s*>`, 'gi'), ' '), html);

/** Turn an HTML document into { title, description, text, links }. Exported for tests. */
export function htmlToPage(html: string, baseUrl: string): Omit<PageText, 'url'> {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, ' ');
  const noCode = stripBlocks(noComments, ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'object']);

  const title = cleanInline(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(noCode)?.[1] || '').slice(0, 300);

  let metaDesc = '';
  let ogDesc = '';
  for (const tag of noCode.match(/<meta\b[^>]*>/gi) || []) {
    const key = (attr(tag, 'name') || attr(tag, 'property')).toLowerCase();
    if (key === 'description' && !metaDesc) metaDesc = attr(tag, 'content');
    else if ((key === 'og:description' || key === 'twitter:description') && !ogDesc) ogDesc = attr(tag, 'content');
  }
  const description = (metaDesc || ogDesc).replace(/\s+/g, ' ').trim().slice(0, 600);

  // Links come from the whole page (nav/footer included): that's where "About" and "Services" live.
  const links: { href: string; text: string }[] = [];
  const seen = new Set<string>();
  const linkRe = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(noCode)) && links.length < MAX_LINKS) {
    const href = attr(lm[1], 'href');
    if (!href || /^(#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    let abs: URL;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
    abs.hash = '';
    const key = abs.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ href: key, text: (cleanInline(lm[2]) || attr(lm[1], 'title') || attr(lm[1], 'aria-label')).slice(0, 120) });
  }

  // Headings are taken before nav/header are stripped, because many sites put the hero h1 in <header>.
  const headings: string[] = [];
  const hRe = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
  let hm: RegExpExecArray | null;
  const navless = stripBlocks(noCode, ['nav']);
  while ((hm = hRe.exec(navless)) && headings.length < 40) {
    const t = cleanInline(hm[2]);
    if (t && t.length <= 200 && !headings.includes(t)) headings.push(t);
  }

  const body = stripBlocks(noCode, ['nav', 'footer', 'header', 'form', 'aside', 'select', 'button', 'dialog'])
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|section|article|main|li|ul|ol|tr|td|th|table|h[1-6]|blockquote|dd|dt|figcaption|pre)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  const lines = decodeEntities(body)
    .split('\n')
    .map((l) => l.replace(/[\s ]+/g, ' ').trim())
    .filter((l) => l.length > 1);
  const dedupedLines: string[] = [];
  const lineSeen = new Set<string>();
  for (const l of lines) {
    if (lineSeen.has(l)) continue;
    lineSeen.add(l);
    dedupedLines.push(l);
  }

  const parts = [
    title && `Title: ${title}`,
    description && `Description: ${description}`,
    headings.length ? `Headings: ${headings.join(' | ')}` : '',
    dedupedLines.join('\n'),
  ].filter(Boolean);
  const text = parts.join('\n').slice(0, PAGE_TEXT_CAP);
  return { title, description, text, links };
}

// ---------------------------------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------------------------------

function charsetOf(contentType: string, head: Uint8Array): string {
  const fromHeader = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const sniff = new TextDecoder('latin1').decode(head.subarray(0, 2048));
  return (/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(sniff)?.[1] || 'utf-8').toLowerCase();
}

async function readCapped(res: Response, signal: AbortSignal): Promise<Uint8Array | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const room = MAX_BYTES - total;
      chunks.push(value.length > room ? value.subarray(0, room) : value);
      total += Math.min(value.length, room);
      if (total >= MAX_BYTES) break; // enough: stop reading, keep what we have
    }
  } catch {
    if (!total) return null;
  } finally {
    reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/**
 * Fetch one public HTML page and return its text. Resolves null on any refusal or failure (never throws).
 * 8s total budget across all redirect hops; at most 3 redirects, each re-validated (scheme, port, host, DNS).
 */
export async function fetchPageText(url: string): Promise<PageText | null> {
  const signal = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
  try {
    let current = await checkFetchable(url);
    for (let hop = 0; current && hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal,
        cache: 'no-store',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'Accept-Language': 'en;q=0.9',
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        res.body?.cancel().catch(() => {});
        if (!location || hop === MAX_REDIRECTS) return null;
        let next: string;
        try {
          next = new URL(location, current).toString();
        } catch {
          return null;
        }
        current = await checkFetchable(next);
        continue;
      }

      if (!res.ok) {
        res.body?.cancel().catch(() => {});
        return null;
      }
      const type = (res.headers.get('content-type') || '').toLowerCase();
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) {
        res.body?.cancel().catch(() => {});
        return null;
      }
      const declared = Number(res.headers.get('content-length') || 0);
      if (declared > MAX_BYTES * 4) {
        res.body?.cancel().catch(() => {});
        return null; // absurdly large page: not a normal company homepage
      }
      const bytes = await readCapped(res, signal);
      if (!bytes || !bytes.length) return null;
      let html: string;
      try {
        html = new TextDecoder(charsetOf(type, bytes)).decode(bytes);
      } catch {
        html = new TextDecoder('utf-8').decode(bytes);
      }
      const finalUrl = current.toString();
      return { url: finalUrl, ...htmlToPage(html, finalUrl) };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------
// Company site reader
// ---------------------------------------------------------------------------------------------------

/** Sub-page keywords, most useful first. */
const PAGE_PATTERNS: RegExp[] = [
  /about/i,
  /company/i,
  /who[-_ ]?we[-_ ]?are/i,
  /services/i,
  /solutions/i,
  /what[-_ ]?we[-_ ]?do/i,
  /industries/i,
  /case[-_ ]?stud/i,
  /customers/i,
];

const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|pptx?|mp4|mp3|mov|avi|xml|json|rss|ics|csv)$/i;
const SKIP_PATH = /(login|log-in|signin|sign-in|signup|register|cart|checkout|account|privacy|cookie|terms|legal|careers?\/.+|blog\/.+|news\/.+|wp-admin|feed)/i;

const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, '');

function pickSubpages(home: PageText, limit: number): string[] {
  if (limit <= 0) return [];
  let homeUrl: URL;
  try {
    homeUrl = new URL(home.url);
  } catch {
    return [];
  }
  const homeKey = homeUrl.origin + homeUrl.pathname.replace(/\/+$/, '');
  const scored: { href: string; rank: number; len: number }[] = [];
  for (const l of home.links) {
    let u: URL;
    try {
      u = new URL(l.href);
    } catch {
      continue;
    }
    if (bareHost(u.hostname) !== bareHost(homeUrl.hostname)) continue;
    if (SKIP_EXT.test(u.pathname) || SKIP_PATH.test(u.pathname)) continue;
    const key = u.origin + u.pathname.replace(/\/+$/, '');
    if (key === homeKey || u.pathname === '/' || u.pathname === '') continue;
    const hay = `${decodeURIComponent(u.pathname).replace(/[-_/]/g, ' ')} ${l.text}`;
    const rank = PAGE_PATTERNS.findIndex((p) => p.test(hay) || p.test(u.pathname));
    if (rank < 0) continue;
    u.search = '';
    scored.push({ href: u.toString(), rank, len: u.pathname.length });
  }
  scored.sort((a, b) => a.rank - b.rank || a.len - b.len);
  // One page per keyword first (About + Services beats About + About/Team), then fill.
  const chosen: string[] = [];
  const usedRanks = new Set<number>();
  for (const s of scored) {
    if (chosen.length >= limit) break;
    if (usedRanks.has(s.rank) || chosen.includes(s.href)) continue;
    usedRanks.add(s.rank);
    chosen.push(s.href);
  }
  for (const s of scored) {
    if (chosen.length >= limit) break;
    if (!chosen.includes(s.href)) chosen.push(s.href);
  }
  return chosen;
}

export interface CompanySite {
  pages: { url: string; title: string; description: string; text: string }[];
  combinedText: string;
}

/**
 * Read a company's homepage plus up to 2 same-site pages (About / Company / Services / Solutions ...).
 * Returns null when the homepage can't be read. Never throws.
 */
export async function readCompanySite(rawUrl: string, opts: { maxPages?: number } = {}): Promise<CompanySite | null> {
  try {
    const start = normalizeWebsite(rawUrl);
    if (!start) return null;
    const maxPages = Math.max(1, Math.min(3, Math.floor(opts.maxPages ?? 3)));

    let home = await fetchPageText(start);
    if (!home) {
      // Common misconfiguration: only one of apex / www answers.
      const u = new URL(start);
      u.hostname = u.hostname.startsWith('www.') ? u.hostname.slice(4) : `www.${u.hostname}`;
      home = await fetchPageText(u.toString());
    }
    if (!home || (!home.text.trim() && !home.title)) return null;

    const subUrls = pickSubpages(home, maxPages - 1);
    const subs = (await Promise.all(subUrls.map((u) => fetchPageText(u)))).filter(
      (p): p is PageText => !!p && p.text.trim().length > 80 && p.url !== home!.url,
    );

    const pages = [home, ...subs].map((p) => ({ url: p.url, title: p.title, description: p.description, text: p.text }));
    const homeCap = subs.length ? 9000 : PAGE_TEXT_CAP;
    const blocks = [`### ${home.title || 'Homepage'} (${home.url})\n${home.text.slice(0, homeCap)}`];
    let used = blocks[0].length;
    subs.forEach((p, i) => {
      const share = Math.floor((COMBINED_TEXT_CAP - used) / (subs.length - i)) - 100;
      if (share <= 200) return;
      const block = `### ${p.title || 'Page'} (${p.url})\n${p.text.slice(0, share)}`;
      blocks.push(block);
      used += block.length + 2;
    });
    return { pages, combinedText: blocks.join('\n\n').slice(0, COMBINED_TEXT_CAP) };
  } catch {
    return null;
  }
}
