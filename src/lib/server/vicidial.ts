/**
 * VICIdial API client (server only). Never import from client components: it reads the API
 * credentials from the server environment.
 *
 * Agent API      {VICIDIAL_URL}/agc/api.php               controls a logged-in agent's session
 * Non-Agent API  {VICIDIAL_URL}/vicidial/non_agent_api.php  status / version lookups
 * Both reply with plain text: "SUCCESS: ... - a|b|c", "ERROR: ...", "VERSION: ...", or pipe-separated values.
 */

export interface VicidialConfig {
  baseUrl: string;
  apiUser: string;
  apiPass: string;
  source: string;
  /** IANA zone VICIdial's server clock runs in; callback times are sent in this zone. */
  timeZone: string;
}

export function getVicidialConfig(): VicidialConfig | null {
  const baseUrl = (process.env.VICIDIAL_URL || '').trim().replace(/\/+$/, '');
  const apiUser = (process.env.VICIDIAL_API_USER || '').trim();
  const apiPass = (process.env.VICIDIAL_API_PASS || '').trim();
  if (!baseUrl || !apiUser || !apiPass || !/^https?:\/\//i.test(baseUrl)) return null;
  return {
    baseUrl,
    apiUser,
    apiPass,
    source: (process.env.VICIDIAL_SOURCE || 'appointmentlyy').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) || 'appointmentlyy',
    timeZone: (process.env.VICIDIAL_TIMEZONE || 'UTC').trim(),
  };
}

// ------------------------------------------------------------------ input validation

/** VICIdial agent usernames are short alphanumeric ids (e.g. "6001", "maria.s"). */
export const isValidAgentUser = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9._-]{1,20}$/.test(v);

/** VICIdial status codes are 1-6 characters (SALE, CALLBK, NI, A, N...). */
export const isValidStatusCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9]{1,6}$/.test(v);

// ------------------------------------------------------------------ URLs

export function buildAgentUrl(cfg: VicidialConfig, agentUser: string, fn: string, params: Record<string, string> = {}): URL {
  const u = new URL(`${cfg.baseUrl}/agc/api.php`);
  u.search = new URLSearchParams({ source: cfg.source, user: cfg.apiUser, pass: cfg.apiPass, agent_user: agentUser, function: fn, ...params }).toString();
  return u;
}

export function buildNonAgentUrl(cfg: VicidialConfig, fn: string, params: Record<string, string> = {}): URL {
  const u = new URL(`${cfg.baseUrl}/vicidial/non_agent_api.php`);
  u.search = new URLSearchParams({ source: cfg.source, user: cfg.apiUser, pass: cfg.apiPass, function: fn, ...params }).toString();
  return u;
}

/** URL safe for logs: credentials removed. */
export function redactUrl(u: URL): string {
  const c = new URL(u.toString());
  if (c.searchParams.has('pass')) c.searchParams.set('pass', '***');
  if (c.searchParams.has('user')) c.searchParams.set('user', '***');
  return c.toString();
}

// ------------------------------------------------------------------ phone numbers

// Longest prefixes first so "+63..." isn't read as "+6".
const COUNTRY_CODES = ['1', '7', '20', '27', '30', '31', '32', '33', '34', '39', '41', '44', '46', '47', '49', '52', '54', '55',
  '57', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '94', '212', '221', '234', '254',
  '351', '353', '372', '502', '503', '505', '506', '598', '852', '880', '886', '966', '971', '972', '974', '995']
  .sort((a, b) => b.length - a.length);

/** "+1 (512) 555-0147" -> { phoneCode: "1", number: "5125550147" }. Numbers without "+" use defaultCode. */
export function splitPhone(raw: string, defaultCode = '1'): { phoneCode: string; number: string } | null {
  const trimmed = (raw || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 6) return null;
  if (!trimmed.startsWith('+') && !trimmed.startsWith('00')) {
    return { phoneCode: defaultCode, number: digits.replace(/^0+/, '') };
  }
  const intl = trimmed.startsWith('00') ? digits.slice(2) : digits;
  const code = COUNTRY_CODES.find((c) => intl.startsWith(c));
  if (!code) return null;
  return { phoneCode: code, number: intl.slice(code.length).replace(/^0+/, '') };
}

// ------------------------------------------------------------------ callbacks

/** ISO time -> "YYYY-MM-DD+HH:MM:SS" in VICIdial's server time zone (the format external_status expects). */
export function formatCallbackDatetime(iso: string, timeZone: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}+${parts.hour}:${parts.minute}:${parts.second}`;
}

// ------------------------------------------------------------------ replies

export interface VicidialReply {
  ok: boolean;
  message: string;
  fields: string[];
  raw: string;
}

export function parseReply(text: string): VicidialReply {
  const raw = (text || '').trim();
  const first = raw.split(/\r?\n/)[0] || '';
  if (/^ERROR/i.test(first)) {
    const [msg, rest = ''] = first.replace(/^ERROR:?\s*/i, '').split(/\s+-\s+/, 2);
    return { ok: false, message: msg.trim(), fields: rest ? rest.split('|') : [], raw };
  }
  if (/^(SUCCESS|NOTICE)/i.test(first)) {
    const [msg, rest = ''] = first.replace(/^(SUCCESS|NOTICE):?\s*/i, '').split(/\s+-\s+/, 2);
    return { ok: true, message: msg.trim(), fields: rest ? rest.split('|') : [], raw };
  }
  if (/^VERSION:/i.test(first)) {
    return { ok: true, message: first, fields: first.split('|'), raw };
  }
  if (first.includes('|')) {
    return { ok: true, message: '', fields: first.split('|'), raw };
  }
  return { ok: false, message: first ? `Unexpected reply: ${first.slice(0, 120)}` : 'Empty reply from VICIdial', fields: [], raw };
}

export type AgentState = 'logged_out' | 'ready' | 'paused' | 'in_call' | 'wrap_up' | 'unknown';

/** Non-Agent API agent_status: "STATUS|call_id|lead_id|campaign|calls_today|full_name|..." */
export function parseAgentStatus(reply: VicidialReply): { state: AgentState; leadId?: string; campaign?: string; detail: string } {
  if (!reply.ok) {
    const notLoggedIn = /not logged in|no agent|agent not found/i.test(reply.message);
    return { state: notLoggedIn ? 'logged_out' : 'unknown', detail: reply.message };
  }
  const [status = '', , leadId = '', campaign = ''] = reply.fields;
  const s = status.trim().toUpperCase();
  const state: AgentState =
    s === 'READY' ? 'ready' :
    s === 'PAUSED' ? 'paused' :
    ['INCALL', 'QUEUE', 'CLOSER', 'MQUEUE'].includes(s) ? 'in_call' :
    ['DISPO', 'DEAD'].includes(s) ? 'wrap_up' : 'unknown';
  return { state, leadId: leadId || undefined, campaign: campaign || undefined, detail: s };
}

// ------------------------------------------------------------------ transport

export class VicidialUnreachableError extends Error {}

export async function callVicidial(url: URL, timeoutMs = 10000): Promise<VicidialReply> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'could not connect';
    throw new VicidialUnreachableError(`VICIdial ${reason} (${new URL(url.toString()).origin}). Is this server's IP allow-listed?`);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new VicidialUnreachableError(`VICIdial returned HTTP ${res.status}. Check VICIDIAL_URL points at the VICIdial web server.`);
  }
  return parseReply(text);
}
