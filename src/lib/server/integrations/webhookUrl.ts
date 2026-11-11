/**
 * Webhook URL rules (SSRF guard): https only, standard port, a public DNS name (no IP literals,
 * localhost or internal suffixes), no credentials, and every address it resolves to is public.
 * The sender re-resolves and pins the connection to a checked address on every attempt.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { INTEGRATION_LIMITS } from '@/lib/integrations';
import { isPublicAddress } from '@/lib/server/meetingPlan/safeFetch';
import { insecureTestReceiverOrigin } from '@/lib/server/integrations/policy';

export type ResolvedAddress = { address: string; family: number };
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export const systemResolver: Resolver = (hostname) => lookup(hostname, { all: true, verbatim: true });

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet', '.corp', '.localdomain', '.test', '.invalid', '.example'];

export type UrlShape =
  | { ok: true; url: URL; hostname: string; testReceiver: boolean }
  | { ok: false; error: string };

/** Checks that need no network. */
export function checkWebhookUrlShape(raw: unknown): UrlShape {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'Enter the https URL that should receive events.' };
  const text = raw.trim();
  if (text.length > INTEGRATION_LIMITS.urlLength) return { ok: false, error: `Keep the URL under ${INTEGRATION_LIMITS.urlLength} characters.` };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: 'That is not a valid URL.' };
  }
  url.hash = '';

  const testOrigin = insecureTestReceiverOrigin();
  if (testOrigin && url.origin === testOrigin && !url.username && !url.password) {
    return { ok: true, url, hostname: url.hostname, testReceiver: true };
  }

  if (url.protocol !== 'https:') return { ok: false, error: 'Webhook URLs must start with https://.' };
  if (url.username || url.password) return { ok: false, error: 'Remove the username or password from the URL. Use the signing secret to verify requests instead.' };
  if (url.port && url.port !== '443') return { ok: false, error: 'Use the standard https port (443).' };
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (hostname.startsWith('[') || isIP(hostname)) return { ok: false, error: 'Use a domain name, not an IP address.' };
  if (!hostname.includes('.') || hostname === 'localhost' || BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
    return { ok: false, error: 'Use a public domain name. Local and internal addresses are not allowed.' };
  }
  return { ok: true, url, hostname, testReceiver: false };
}

export type Resolution = { ok: true; addresses: ResolvedAddress[] } | { ok: false; error: string };

/** Every address must be public; a single private answer refuses the host (DNS can be split or rebound). */
export async function resolvePublicHost(hostname: string, resolve: Resolver = systemResolver): Promise<Resolution> {
  let answers: ResolvedAddress[];
  try {
    answers = await resolve(hostname);
  } catch {
    return { ok: false, error: `We couldn't find ${hostname}. Check the address.` };
  }
  if (!answers.length) return { ok: false, error: `We couldn't find ${hostname}. Check the address.` };
  if (answers.some((a) => !isPublicAddress(a.address))) {
    return { ok: false, error: `${hostname} points to a private or internal network address. Use a public URL.` };
  }
  return { ok: true, addresses: answers };
}

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string };

/** Full check used when an admin saves an endpoint. Returns the normalised URL. */
export async function validateWebhookUrl(raw: unknown, resolve: Resolver = systemResolver): Promise<UrlCheck> {
  const shape = checkWebhookUrlShape(raw);
  if (!shape.ok) return shape;
  if (!shape.testReceiver) {
    const r = await resolvePublicHost(shape.hostname, resolve);
    if (!r.ok) return r;
  }
  return { ok: true, url: shape.url.href };
}
