/**
 * Slow-request logging: one warn line when a proxy pass or an API request takes longer than
 * SLOW_REQUEST_MS. The line holds the HTTP method, the route pattern and the duration, nothing
 * else: no query string, no ids, tokens, emails or other personal data.
 */
export const SLOW_REQUEST_MS = 2000;

/** Path prefixes whose next segment is a secret link token: always masked, whatever it looks like. */
const TOKEN_PREFIXES = ['/s/', '/b/', '/api/sign/', '/api/board/', '/certificate/'];

/**
 * Turn a pathname into a route pattern. Only short, lowercase, word-like segments (the fixed parts
 * of our routes) are kept; anything else (ids, tokens, emails, codes, file names) becomes ":id".
 */
export function routePattern(pathname: string): string {
  const path = pathname.split('?')[0].split('#')[0];
  let maskNext = false;
  let prefix = '';
  const out = path.split('/').map((seg, i) => {
    if (seg === '') return '';
    prefix += `/${seg}`;
    const mask = maskNext || prefix.startsWith('/api/webhooks/') || !/^[a-z][a-z-]{0,23}$/.test(seg);
    maskNext = TOKEN_PREFIXES.includes(`${prefix}/`);
    return mask ? ':id' : seg;
  });
  return out.join('/').slice(0, 120) || '/';
}

export function warnIfSlow(kind: 'proxy' | 'api', method: string, pathname: string, startedAt: number) {
  const ms = Math.round(performance.now() - startedAt);
  if (ms < SLOW_REQUEST_MS) return;
  const verb = /^[A-Z]{3,7}$/.test(method) ? method : 'OTHER';
  console.warn(`[slow] ${kind} ${verb} ${routePattern(pathname)} ${ms}ms`);
}
