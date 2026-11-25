/**
 * Server-only storage for Agreements (the platform owner's e-signature tool). Same two backends as
 * emailTemplateStore, tenantStore and announcementStore: Supabase (tables in
 * supabase/migrations/20261120000000_agreements.sql) or JSON files under TENANCY_DATA_DIR for local
 * work (agreements.json plus agreements_files/<envelope>/<kind>).
 *
 * Binary files (frozen PDFs, signature PNGs) go in a bytea table, never a public bucket: they are
 * streamed only through owner- or token-checked routes.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { newId, nowIso } from '@/lib/server/tenantStore';
import {
  AGREEMENT_LIMITS,
  type AgreementEvent,
  type AgreementEventType,
  type AgreementSettings,
  type CcRecipient,
  type Envelope,
  type EnvelopeStatus,
} from '@/lib/agreements/envelope';

export type AgreementFileKind = 'original' | 'final' | 'certificate' | 'signer-signature' | 'owner-signature';
export type OtpPurpose = 'view' | 'sign';

export interface OtpRow {
  id: string;
  envelopeId: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  createdAt: string;
  consumedAt: string | null;
}

export interface OtpExpect {
  attempts?: number;
  unconsumed?: boolean;
}

/** Settings as stored: the public settings plus the owner's saved signature (PNG data URL). */
export interface StoredAgreementSettings extends Omit<AgreementSettings, 'hasSavedSignature'> {
  savedSignature?: string | null;
}

export interface NewEvent {
  envelopeId: string;
  type: AgreementEventType;
  ip?: string | null;
  userAgent?: string | null;
  data?: Record<string, unknown>;
  at?: string;
}

export interface AgreementStore {
  readonly backend: 'supabase' | 'file';
  listEnvelopes(): Promise<Envelope[]>;
  getEnvelope(id: string): Promise<Envelope | null>;
  findByTokenHash(hash: string): Promise<Envelope | null>;
  /** The envelope and the (not removed) copy recipient whose view-only token hashes to `hash`. */
  findByCcTokenHash(hash: string): Promise<{ envelope: Envelope; cc: CcRecipient } | null>;
  /**
   * Whether copy recipients can be stored. True for both backends: Supabase keeps them inside the
   * existing `template_meta` jsonb column (no migration needed).
   */
  ccSupported(): Promise<boolean>;
  createEnvelope(e: Envelope): Promise<Envelope>;
  /**
   * Patch the given fields. With `ifStatus`, only when the current status is one of them (else null).
   * `ifWelcomeClaim`: only when the stored welcome-email claim id (notified.welcome.claimId) equals it, `null` meaning
   * "no welcome claim yet" (compare-and-set, so a welcome email is claimed by exactly one request).
   */
  updateEnvelope(id: string, patch: Partial<Envelope>, ifStatus?: EnvelopeStatus[], opts?: UpdateOpts): Promise<Envelope | null>;
  deleteEnvelope(id: string): Promise<boolean>;
  addEvent(ev: NewEvent): Promise<AgreementEvent>;
  listEvents(envelopeId: string): Promise<AgreementEvent[]>;
  /** Store a new code; earlier unused codes for the same envelope and purpose stop working. */
  addOtp(row: Omit<OtpRow, 'id' | 'createdAt' | 'attempts' | 'consumedAt'>): Promise<OtpRow>;
  latestOtp(envelopeId: string, purpose: OtpPurpose): Promise<OtpRow | null>;
  /**
   * Compare-and-set on a code row: applies `patch` only while the row still matches `expect`
   * (attempts unchanged, and/or not consumed yet). False when another request got there first.
   */
  updateOtp(id: string, patch: { attempts?: number; consumedAt?: string | null }, expect?: OtpExpect): Promise<boolean>;
  putFile(envelopeId: string, kind: AgreementFileKind, mime: 'application/pdf' | 'image/png', bytes: Uint8Array): Promise<{ sha256: string; size: number }>;
  getFile(envelopeId: string, kind: AgreementFileKind): Promise<{ bytes: Buffer; mime: string; sha256: string } | null>;
  getSettings(): Promise<StoredAgreementSettings | null>;
  putSettings(value: StoredAgreementSettings, updatedBy: string): Promise<void>;
}

export interface UpdateOpts {
  ifNoOwnerSignature?: boolean;
  ifWelcomeClaim?: string | null;
}

/** The database tables aren't there yet (migration not run). */
export class AgreementStorageError extends Error {}

/** Shown to the owner if copies cannot be stored (kept for safety; both backends support them). */
export const CC_UNAVAILABLE_MESSAGE = 'Copy recipients are not available on this server. Remove the copies to save or send now.';

/** Constant-time compare of two hex hashes. */
function sameHash(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/** The live copy recipient for a token hash (removed copies and cleared tokens never match). */
function ccMatch(e: Envelope, hash: string): CcRecipient | null {
  let hit: CcRecipient | null = null;
  for (const c of e.cc ?? []) if (!c.removedAt && sameHash(c.tokenHash, hash)) hit = c;
  return hit;
}

export const sha256Hex = (b: Uint8Array | string) => crypto.createHash('sha256').update(b).digest('hex');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isEnvelopeId = (id: string) => UUID_RE.test(id);
const FILE_KINDS: AgreementFileKind[] = ['original', 'final', 'certificate', 'signer-signature', 'owner-signature'];

// ------------------------------------------------------------------ file backend

interface FileData {
  envelopes: Envelope[];
  events: AgreementEvent[];
  otps: OtpRow[];
  settings: StoredAgreementSettings | null;
}

class FileAgreementStore implements AgreementStore {
  readonly backend = 'file' as const;
  private file: string;
  private filesDir: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(dir: string) {
    this.file = path.join(dir, 'agreements.json');
    this.filesDir = path.join(dir, 'agreements_files');
  }
  private read(): FileData {
    try {
      const p = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<FileData>;
      // Records written before copy recipients existed have no `cc`.
      const envelopes = (p.envelopes ?? []).map((e) => (Array.isArray(e.cc) ? e : { ...e, cc: [] }));
      return { envelopes, events: p.events ?? [], otps: p.otps ?? [], settings: p.settings ?? null };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { envelopes: [], events: [], otps: [], settings: null };
      throw err;
    }
  }
  private write(d: FileData) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(d), 'utf8');
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (d: FileData) => T): Promise<T> {
    const run = this.queue.then(() => {
      const d = this.read();
      const out = fn(d);
      this.write(d);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  async listEnvelopes() {
    return this.read().envelopes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async getEnvelope(id: string) {
    return this.read().envelopes.find((e) => e.id === id) ?? null;
  }
  async findByTokenHash(hash: string) {
    const want = Buffer.from(hash, 'hex');
    let hit: Envelope | null = null;
    for (const e of this.read().envelopes) {
      if (!e.tokenHash) continue;
      const have = Buffer.from(e.tokenHash, 'hex');
      if (have.length === want.length && crypto.timingSafeEqual(have, want)) hit = e;
    }
    return hit;
  }
  async findByCcTokenHash(hash: string) {
    let hit: { envelope: Envelope; cc: CcRecipient } | null = null;
    for (const e of this.read().envelopes) {
      const cc = ccMatch(e, hash);
      if (cc) hit = { envelope: e, cc };
    }
    return hit;
  }
  async ccSupported() {
    return true;
  }
  createEnvelope(e: Envelope) {
    return this.mutate((d) => {
      d.envelopes.push(e);
      return { ...e, cc: e.cc ?? [] };
    });
  }
  updateEnvelope(id: string, patch: Partial<Envelope>, ifStatus?: EnvelopeStatus[], opts?: UpdateOpts) {
    const p = patch;
    return this.mutate((d) => {
      const i = d.envelopes.findIndex((e) => e.id === id);
      if (i < 0) return null;
      if (ifStatus && !ifStatus.includes(d.envelopes[i].status)) return null;
      if (opts?.ifNoOwnerSignature && d.envelopes[i].ownerSignature) return null;
      if (opts && 'ifWelcomeClaim' in opts && (d.envelopes[i].notified?.welcome?.claimId ?? null) !== opts.ifWelcomeClaim) return null;
      d.envelopes[i] = { ...d.envelopes[i], ...p, id, updatedAt: nowIso() };
      return { ...d.envelopes[i], cc: d.envelopes[i].cc ?? [] };
    });
  }
  async deleteEnvelope(id: string) {
    const ok = await this.mutate((d) => {
      const n = d.envelopes.length;
      d.envelopes = d.envelopes.filter((e) => e.id !== id);
      d.events = d.events.filter((e) => e.envelopeId !== id);
      d.otps = d.otps.filter((o) => o.envelopeId !== id);
      return d.envelopes.length < n;
    });
    if (ok && isEnvelopeId(id)) fs.rmSync(path.join(this.filesDir, id), { recursive: true, force: true });
    return ok;
  }
  addEvent(ev: NewEvent) {
    return this.mutate((d) => {
      const row: AgreementEvent = {
        id: newId(),
        envelopeId: ev.envelopeId,
        type: ev.type,
        at: ev.at ?? nowIso(),
        ip: ev.ip ?? null,
        userAgent: ev.userAgent ? ev.userAgent.slice(0, 400) : null,
        data: ev.data ?? {},
      };
      d.events.push(row);
      return row;
    });
  }
  async listEvents(envelopeId: string) {
    return this.read()
      .events.filter((e) => e.envelopeId === envelopeId)
      .sort((a, b) => a.at.localeCompare(b.at));
  }
  addOtp(row: Omit<OtpRow, 'id' | 'createdAt' | 'attempts' | 'consumedAt'>) {
    return this.mutate((d) => {
      const now = nowIso();
      for (const o of d.otps) if (o.envelopeId === row.envelopeId && o.purpose === row.purpose && !o.consumedAt) o.consumedAt = now;
      // Keep the file small: drop codes older than a day.
      const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
      d.otps = d.otps.filter((o) => o.createdAt > dayAgo);
      const full: OtpRow = { ...row, id: newId(), createdAt: now, attempts: 0, consumedAt: null };
      d.otps.push(full);
      return full;
    });
  }
  async latestOtp(envelopeId: string, purpose: OtpPurpose) {
    const rows = this.read().otps.filter((o) => o.envelopeId === envelopeId && o.purpose === purpose);
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows[0] ?? null;
  }
  updateOtp(id: string, patch: { attempts?: number; consumedAt?: string | null }, expect: OtpExpect = {}) {
    return this.mutate((d) => {
      const o = d.otps.find((x) => x.id === id);
      if (!o) return false;
      if (expect.attempts !== undefined && o.attempts !== expect.attempts) return false;
      if (expect.unconsumed && o.consumedAt) return false;
      Object.assign(o, patch);
      return true;
    });
  }
  async putFile(envelopeId: string, kind: AgreementFileKind, mime: 'application/pdf' | 'image/png', bytes: Uint8Array) {
    if (!isEnvelopeId(envelopeId) || !FILE_KINDS.includes(kind)) throw new Error('[agreementStore] bad file key');
    const dir = path.join(this.filesDir, envelopeId);
    fs.mkdirSync(dir, { recursive: true });
    const sha256 = sha256Hex(bytes);
    const target = path.join(dir, `${kind}.bin`);
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, target);
    fs.writeFileSync(path.join(dir, `${kind}.json`), JSON.stringify({ mime, sha256 }), 'utf8');
    return { sha256, size: bytes.length };
  }
  async getFile(envelopeId: string, kind: AgreementFileKind) {
    if (!isEnvelopeId(envelopeId) || !FILE_KINDS.includes(kind)) return null;
    const dir = path.join(this.filesDir, envelopeId);
    try {
      const bytes = fs.readFileSync(path.join(dir, `${kind}.bin`));
      const meta = JSON.parse(fs.readFileSync(path.join(dir, `${kind}.json`), 'utf8')) as { mime: string; sha256: string };
      return { bytes, mime: meta.mime, sha256: meta.sha256 };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }
  async getSettings() {
    return this.read().settings;
  }
  async putSettings(value: StoredAgreementSettings) {
    await this.mutate((d) => {
      d.settings = value;
    });
  }
}

// ------------------------------------------------------------------ Supabase backend

type Row = Record<string, unknown>;
const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST204', '42703']);

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString());

/**
 * Copy recipients are stored inside the existing `template_meta` jsonb column (key `cc`), so no
 * migration is needed. After sending, template_meta is written only by owner actions (never by the
 * signer's opens, heartbeats or signing), so copy updates are not overwritten by signer activity.
 */
function splitMeta(v: unknown): { templateMeta: Envelope['templateMeta']; cc: CcRecipient[] } {
  if (!v || typeof v !== 'object') return { templateMeta: null, cc: [] };
  const { cc, ...rest } = v as Record<string, unknown>;
  return { templateMeta: Object.keys(rest).length ? (rest as unknown as Envelope['templateMeta']) : null, cc: Array.isArray(cc) ? (cc as CcRecipient[]) : [] };
}
function joinMeta(tm: Envelope['templateMeta'], cc: CcRecipient[]): Record<string, unknown> | null {
  if (!tm && !cc.length) return null;
  return { ...(tm ?? {}), ...(cc.length ? { cc } : {}) };
}

function envFromRow(r: Row): Envelope {
  const meta = splitMeta(r.template_meta);
  return {
    id: String(r.id),
    templateId: String(r.template_id),
    templateMeta: meta.templateMeta,
    title: String(r.title ?? ''),
    fieldValues: (r.field_values as Record<string, string>) ?? {},
    recipient: { name: String(r.recipient_name ?? ''), title: String(r.recipient_title ?? ''), email: String(r.recipient_email ?? '') },
    cc: meta.cc,
    access: {
      expiresAt: iso(r.expires_at) ?? '',
      openFrom: iso(r.open_from),
      openUntil: iso(r.open_until),
      maxOpens: r.max_opens === null || r.max_opens === undefined ? null : Number(r.max_opens),
      requireOtpToView: r.require_otp_to_view === true,
      downloadDays: Number(r.download_days ?? AGREEMENT_LIMITS.defaultDownloadDays),
    },
    status: String(r.status) as EnvelopeStatus,
    originalSha256: str(r.original_sha256),
    finalSha256: str(r.final_sha256),
    pageCount: Number(r.page_count ?? 0),
    tokenHash: str(r.token_hash),
    tokenSealed: str(r.token_sealed),
    opens: Number(r.opens ?? 0),
    viewSeconds: Number(r.view_seconds ?? 0),
    maxPage: Number(r.max_page ?? 0),
    pagesSeen: Array.isArray(r.pages_seen) ? (r.pages_seen as unknown[]).map(Number) : [],
    signerFormValues: (r.signer_form_values as Record<string, unknown>) ?? null,
    signer: (r.signer as Envelope['signer']) ?? null,
    ownerSignature: (r.owner_signature as Envelope['ownerSignature']) ?? null,
    declineReason: str(r.decline_reason),
    billing: (r.billing as Envelope['billing']) ?? null,
    visitStats: (r.visit_stats as Envelope['visitStats']) ?? {},
    notified: (r.notified as Envelope['notified']) ?? {},
    createdBy: String(r.created_by ?? ''),
    createdAt: iso(r.created_at) ?? '',
    updatedAt: iso(r.updated_at) ?? '',
    sentAt: iso(r.sent_at),
    firstOpenedAt: iso(r.first_opened_at),
    lastActivityAt: iso(r.last_activity_at),
    signedAt: iso(r.signed_at),
    completedAt: iso(r.completed_at),
    declinedAt: iso(r.declined_at),
    revokedAt: iso(r.revoked_at),
  };
}

/** Only the columns for the keys present in `p` (so concurrent writers don't overwrite each other). */
function envToRow(p: Partial<Envelope>): Row {
  const r: Row = {};
  const map: [keyof Envelope, string][] = [
    ['id', 'id'],
    ['templateId', 'template_id'],
    ['templateMeta', 'template_meta'],
    ['title', 'title'],
    ['fieldValues', 'field_values'],
    ['status', 'status'],
    ['originalSha256', 'original_sha256'],
    ['finalSha256', 'final_sha256'],
    ['pageCount', 'page_count'],
    ['tokenHash', 'token_hash'],
    ['tokenSealed', 'token_sealed'],
    ['opens', 'opens'],
    ['viewSeconds', 'view_seconds'],
    ['maxPage', 'max_page'],
    ['pagesSeen', 'pages_seen'],
    ['signerFormValues', 'signer_form_values'],
    ['signer', 'signer'],
    ['ownerSignature', 'owner_signature'],
    ['declineReason', 'decline_reason'],
    ['billing', 'billing'],
    ['visitStats', 'visit_stats'],
    ['notified', 'notified'],
    ['createdBy', 'created_by'],
    ['createdAt', 'created_at'],
    ['sentAt', 'sent_at'],
    ['firstOpenedAt', 'first_opened_at'],
    ['lastActivityAt', 'last_activity_at'],
    ['signedAt', 'signed_at'],
    ['completedAt', 'completed_at'],
    ['declinedAt', 'declined_at'],
    ['revokedAt', 'revoked_at'],
  ];
  for (const [k, col] of map) if (k in p) r[col] = p[k] ?? null;
  // template_meta carries the copy list too (see splitMeta); callers pass both via withCc().
  if ('templateMeta' in p || 'cc' in p) r.template_meta = joinMeta(p.templateMeta ?? null, p.cc ?? []);
  if (p.recipient) {
    r.recipient_name = p.recipient.name;
    r.recipient_title = p.recipient.title;
    r.recipient_email = p.recipient.email;
  }
  if (p.access) {
    r.expires_at = p.access.expiresAt || null;
    r.open_from = p.access.openFrom;
    r.open_until = p.access.openUntil;
    r.max_opens = p.access.maxOpens;
    r.require_otp_to_view = p.access.requireOtpToView;
    r.download_days = p.access.downloadDays;
  }
  return r;
}

const eventFromRow = (r: Row): AgreementEvent => ({
  id: String(r.id),
  envelopeId: String(r.envelope_id),
  type: String(r.type) as AgreementEventType,
  at: iso(r.at) ?? '',
  ip: str(r.ip),
  userAgent: str(r.user_agent),
  data: (r.data as Record<string, unknown>) ?? {},
});

const otpFromRow = (r: Row): OtpRow => ({
  id: String(r.id),
  envelopeId: String(r.envelope_id),
  purpose: String(r.purpose) as OtpPurpose,
  codeHash: String(r.code_hash),
  expiresAt: iso(r.expires_at) ?? '',
  attempts: Number(r.attempts ?? 0),
  createdAt: iso(r.created_at) ?? '',
  consumedAt: iso(r.consumed_at),
});

/** bytea over PostgREST: written and read as "\x<hex>". */
const toBytea = (b: Uint8Array) => `\\x${Buffer.from(b).toString('hex')}`;
function fromBytea(v: unknown): Buffer {
  const s = String(v ?? '');
  return s.startsWith('\\x') ? Buffer.from(s.slice(2), 'hex') : Buffer.from(s, 'base64');
}

class SupabaseAgreementStore implements AgreementStore {
  readonly backend = 'supabase' as const;
  constructor(private db: SupabaseClient) {}
  async ccSupported() {
    return true;
  }
  /**
   * A patch that touches templateMeta or cc must write both into template_meta: the missing half is
   * read from the current row (owner actions only, so no race with the signer).
   */
  private async withCc(id: string, patch: Partial<Envelope>): Promise<Partial<Envelope>> {
    if (!('templateMeta' in patch) && !('cc' in patch)) return patch;
    if ('templateMeta' in patch && 'cc' in patch) return patch;
    const cur = this.check(await this.db.from('agreement_envelopes').select('template_meta').eq('id', id).maybeSingle()) as Row | null;
    const now = splitMeta(cur?.template_meta);
    return { ...patch, templateMeta: 'templateMeta' in patch ? patch.templateMeta ?? null : now.templateMeta, cc: 'cc' in patch ? patch.cc ?? [] : now.cc };
  }
  async findByCcTokenHash(hash: string) {
    if (!/^[0-9a-f]{64}$/.test(hash)) return null;
    // jsonb containment on template_meta->cc, then a constant-time check in code. If the filter is
    // refused for any reason, fall back to checking the (owner-scale) envelope list in code.
    const res = await this.db.from('agreement_envelopes').select('*').filter('template_meta->cc', 'cs', JSON.stringify([{ tokenHash: hash }])).limit(2);
    const rows = res.error ? ((this.check(await this.db.from('agreement_envelopes').select('*').limit(1000)) as Row[]) ?? []) : ((res.data as Row[]) ?? []);
    for (const r of rows) {
      const e = envFromRow(r);
      const cc = ccMatch(e, hash);
      if (cc) return { envelope: e, cc };
    }
    return null;
  }
  private check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
    if (res.error) {
      if (res.error.code && MISSING_TABLE.has(res.error.code)) throw new AgreementStorageError(res.error.message);
      throw new Error(`[agreementStore] ${res.error.message}`);
    }
    return res.data;
  }
  async listEnvelopes() {
    const rows = this.check(await this.db.from('agreement_envelopes').select('*').order('updated_at', { ascending: false }).limit(1000)) as Row[];
    return rows.map(envFromRow);
  }
  async getEnvelope(id: string) {
    if (!isEnvelopeId(id)) return null;
    const r = this.check(await this.db.from('agreement_envelopes').select('*').eq('id', id).maybeSingle()) as Row | null;
    return r ? envFromRow(r) : null;
  }
  async findByTokenHash(hash: string) {
    if (!/^[0-9a-f]{64}$/.test(hash)) return null;
    const r = this.check(await this.db.from('agreement_envelopes').select('*').eq('token_hash', hash).maybeSingle()) as Row | null;
    if (!r) return null;
    const e = envFromRow(r);
    const a = Buffer.from(e.tokenHash || '', 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? e : null;
  }
  async createEnvelope(e: Envelope) {
    const r = this.check(await this.db.from('agreement_envelopes').insert({ ...envToRow(e), updated_at: e.updatedAt }).select().single()) as Row;
    return envFromRow(r);
  }
  async updateEnvelope(id: string, patch: Partial<Envelope>, ifStatus?: EnvelopeStatus[], opts?: UpdateOpts) {
    if (!isEnvelopeId(id)) return null;
    let q = this.db.from('agreement_envelopes').update({ ...envToRow(await this.withCc(id, patch)), updated_at: nowIso() }).eq('id', id);
    if (ifStatus) q = q.in('status', ifStatus);
    if (opts?.ifNoOwnerSignature) q = q.is('owner_signature', null);
    // Welcome-email claim: a filter on the existing `notified` jsonb column (no migration). Claim ids are
    // base64url, so they are safe inside a PostgREST filter value.
    if (opts && 'ifWelcomeClaim' in opts) {
      if (opts.ifWelcomeClaim === null) q = q.is('notified->>welcome', null);
      else if (/^[A-Za-z0-9_-]{8,64}$/.test(opts.ifWelcomeClaim ?? '')) q = q.eq('notified->welcome->>claimId', opts.ifWelcomeClaim as string);
      else return null;
    }
    const r = this.check(await q.select().maybeSingle()) as Row | null;
    return r ? envFromRow(r) : null;
  }
  async deleteEnvelope(id: string) {
    if (!isEnvelopeId(id)) return false;
    const rows = this.check(await this.db.from('agreement_envelopes').delete().eq('id', id).select('id')) as Row[] | null;
    return Boolean(rows && rows.length);
  }
  async addEvent(ev: NewEvent) {
    const r = this.check(
      await this.db
        .from('agreement_events')
        .insert({
          envelope_id: ev.envelopeId,
          type: ev.type,
          at: ev.at ?? nowIso(),
          ip: ev.ip ? ev.ip.slice(0, 100) : null,
          user_agent: ev.userAgent ? ev.userAgent.slice(0, 400) : null,
          data: ev.data ?? {},
        })
        .select()
        .single(),
    ) as Row;
    return eventFromRow(r);
  }
  async listEvents(envelopeId: string) {
    const rows = this.check(await this.db.from('agreement_events').select('*').eq('envelope_id', envelopeId).order('at', { ascending: true }).limit(5000)) as Row[];
    return rows.map(eventFromRow);
  }
  async addOtp(row: Omit<OtpRow, 'id' | 'createdAt' | 'attempts' | 'consumedAt'>) {
    const now = nowIso();
    this.check(
      await this.db.from('agreement_otps').update({ consumed_at: now }).eq('envelope_id', row.envelopeId).eq('purpose', row.purpose).is('consumed_at', null),
    );
    const r = this.check(
      await this.db
        .from('agreement_otps')
        .insert({ envelope_id: row.envelopeId, purpose: row.purpose, code_hash: row.codeHash, expires_at: row.expiresAt })
        .select()
        .single(),
    ) as Row;
    return otpFromRow(r);
  }
  async latestOtp(envelopeId: string, purpose: OtpPurpose) {
    const r = this.check(
      await this.db.from('agreement_otps').select('*').eq('envelope_id', envelopeId).eq('purpose', purpose).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ) as Row | null;
    return r ? otpFromRow(r) : null;
  }
  async updateOtp(id: string, patch: { attempts?: number; consumedAt?: string | null }, expect: OtpExpect = {}) {
    const row: Row = {};
    if (patch.attempts !== undefined) row.attempts = patch.attempts;
    if (patch.consumedAt !== undefined) row.consumed_at = patch.consumedAt;
    let q = this.db.from('agreement_otps').update(row).eq('id', id);
    if (expect.attempts !== undefined) q = q.eq('attempts', expect.attempts);
    if (expect.unconsumed) q = q.is('consumed_at', null);
    const rows = this.check(await q.select('id')) as Row[] | null;
    return Boolean(rows && rows.length);
  }
  async putFile(envelopeId: string, kind: AgreementFileKind, mime: 'application/pdf' | 'image/png', bytes: Uint8Array) {
    const sha256 = sha256Hex(bytes);
    this.check(
      await this.db
        .from('agreement_files')
        .upsert({ envelope_id: envelopeId, kind, mime, bytes: toBytea(bytes), sha256, size: bytes.length, created_at: nowIso() }),
    );
    return { sha256, size: bytes.length };
  }
  async getFile(envelopeId: string, kind: AgreementFileKind) {
    if (!isEnvelopeId(envelopeId)) return null;
    const r = this.check(
      await this.db.from('agreement_files').select('bytes, mime, sha256').eq('envelope_id', envelopeId).eq('kind', kind).maybeSingle(),
    ) as Row | null;
    return r ? { bytes: fromBytea(r.bytes), mime: String(r.mime), sha256: String(r.sha256) } : null;
  }
  async getSettings() {
    const r = this.check(await this.db.from('agreement_settings').select('value').eq('id', 'default').maybeSingle()) as Row | null;
    return r ? (r.value as StoredAgreementSettings) : null;
  }
  async putSettings(value: StoredAgreementSettings, updatedBy: string) {
    this.check(await this.db.from('agreement_settings').upsert({ id: 'default', value, updated_by: updatedBy, updated_at: nowIso() }));
  }
}

let store: AgreementStore | null = null;
export function getAgreementStore(): AgreementStore {
  if (store) return store;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) {
    store = new SupabaseAgreementStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else {
    if (process.env.NODE_ENV === 'production' && !process.env.TENANCY_DATA_DIR) {
      throw new Error('[agreementStore] No database configured. Set SUPABASE_SERVICE_ROLE_KEY or TENANCY_DATA_DIR.');
    }
    store = new FileAgreementStore(process.env.TENANCY_DATA_DIR || path.join(process.cwd(), '.data'));
  }
  return store;
}
