/**
 * Server only. The sending-domain DNS card: the exact records the client adds, and the check. Same approach as the
 * platform's custom-domain verification (/api/domains/verify: node:dns lookups, nothing persisted by the resolver):
 *   - an ownership TXT record, `_appointmentlyy-verify.<domain>`, whose value is derived from the project and the
 *     domain (an HMAC, so it cannot be guessed for another project);
 *   - any records the owner adds from the email provider's dashboard (DKIM, SPF, MX for the sending subdomain).
 * The check resolves every record and compares values. On a LOCAL test server only, CP_TEST_DNS_FILE may point at a
 * JSON file of fake answers ({ "TXT name": ["value"], ... }) so the regression suite never depends on the internet.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import dns from 'node:dns/promises';
import { isLocalTestServer } from '@/lib/server/agreements/mail';
import type { DnsRecord } from '@/lib/clientProjects/intake';

export const DOMAIN_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function cleanDomain(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const d = v
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
  return DOMAIN_RE.test(d) ? d : null;
}

function verifyValue(projectId: string, domain: string): string {
  // Never a built-in fallback: a constant secret would make every project's record value guessable.
  const secret = (process.env.AUTH_SECRET || '').trim();
  if (!secret) throw new Error('[client-intake dns] AUTH_SECRET is not set: the DNS verification value cannot be made.');
  return `appy-verify=${crypto.createHmac('sha256', secret).update(`cp-dns|${projectId}|${domain}`).digest('hex').slice(0, 32)}`;
}

/** Every record the client must add for `domain` (ownership first, then the owner's extra records). */
export function recordsFor(projectId: string, domain: string, extra: DnsRecord[] = []): DnsRecord[] {
  return [{ type: 'TXT', name: `_appointmentlyy-verify.${domain}`, value: verifyValue(projectId, domain), purpose: 'Proves you control the domain.' }, ...extra];
}

export function cleanRecords(v: unknown, domain: string): DnsRecord[] {
  if (!Array.isArray(v)) throw new Error('Send the records as a list.');
  if (v.length > 10) throw new Error('At most 10 extra records.');
  return v.map((x, i) => {
    const r = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
    const type = r.type === 'TXT' || r.type === 'CNAME' || r.type === 'MX' ? r.type : null;
    if (!type) throw new Error(`Record ${i + 1}: the type is TXT, CNAME or MX.`);
    const name = typeof r.name === 'string' ? r.name.trim().toLowerCase().replace(/\.$/, '') : '';
    if (!DOMAIN_RE.test(name.replace(/^_/, 'x').replace(/\._/g, '.x')) || !(name === domain || name.endsWith(`.${domain}`))) throw new Error(`Record ${i + 1}: the name must be ${domain} or a name under it.`);
    const value = typeof r.value === 'string' ? r.value.replace(/[\u0000-\u001f\u007f]+/g, '').trim().slice(0, 1000) : '';
    if (!value) throw new Error(`Record ${i + 1}: enter the value.`);
    const purpose = typeof r.purpose === 'string' ? r.purpose.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 120) : '';
    return { type, name, value, purpose: purpose || 'Email sending.' };
  });
}

type Fake = Record<string, string[]>;
function fakeAnswers(): Fake | null {
  if (!isLocalTestServer()) return null;
  const f = process.env.CP_TEST_DNS_FILE;
  if (!f) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')) as Fake;
  } catch {
    return {};
  }
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const normHost = (s: string) => s.trim().toLowerCase().replace(/\.$/, '');

async function lookup(type: DnsRecord['type'], name: string): Promise<string[]> {
  const fake = fakeAnswers();
  if (fake) return fake[`${type} ${name}`] ?? [];
  try {
    if (type === 'TXT') return (await withTimeout(dns.resolveTxt(name), 5000)).map((chunks) => chunks.join(''));
    if (type === 'CNAME') return await withTimeout(dns.resolveCname(name), 5000);
    return (await withTimeout(dns.resolveMx(name), 5000)).map((m) => m.exchange);
  } catch {
    return [];
  }
}

/** Resolve every record; each is ok when the expected value is among the answers. */
export async function checkRecords(records: DnsRecord[]): Promise<{ type: string; name: string; ok: boolean }[]> {
  return Promise.all(
    records.map(async (r) => {
      const got = await lookup(r.type, r.name);
      const want = r.type === 'TXT' ? r.value.trim() : normHost(r.value);
      const ok = got.some((g) => (r.type === 'TXT' ? g.trim() === want : normHost(g) === want));
      return { type: r.type, name: r.name, ok };
    }),
  );
}
