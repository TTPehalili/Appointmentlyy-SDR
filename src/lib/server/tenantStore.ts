/**
 * Server-only storage for tenants (client organizations), their members and the auth audit log.
 *
 * Two backends with the same interface:
 * - Supabase (tables from supabase/migrations/20261110000000_tenants_and_members.sql), used when
 *   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
 * - A JSON file (.data/tenancy.json), used otherwise. Fine for local work and a single
 *   long-running server; NOT for serverless hosts (read-only / per-instance file systems).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '@/lib/roles';

export type TenantStatus = 'active' | 'suspended';
export type MemberStatus = 'invited' | 'active' | 'removed';

export interface TenantBranding {
  /** Hex brand colour, e.g. "#0F766E". Empty = Appointmentlyy default. */
  brandColor?: string;
  /** Name shown in the app's workspace switcher; defaults to the tenant name. */
  displayName?: string;
  /** Two letters shown on the workspace tile. */
  logoInitials?: string;
  supportEmail?: string;
}

export interface Tenant {
  code: string;
  name: string;
  plan: string;
  /** Max invited + active members. 0 = unlimited. */
  seatLimit: number;
  status: TenantStatus;
  modules: Record<string, boolean>;
  branding: TenantBranding;
  createdBy: string;
  createdAt: string;
}

export interface Member {
  id: string;
  tenantCode: string;
  email: string;
  name: string;
  role: Role;
  status: MemberStatus;
  invitedBy: string;
  invitedAt: string;
  joinedAt: string | null;
  lastLoginAt: string | null;
  /** Rotated on every (re)invite; only the newest invite link works. */
  inviteNonce: string | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorEmail: string;
  tenantCode: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
}

/** A person's password (one per email, shared across their workspaces). Hash only, never the password. */
export interface Credential {
  email: string;
  passwordHash: string;
  updatedAt: string;
}

export interface TenantStore {
  readonly backend: 'supabase' | 'file';
  listTenants(): Promise<Tenant[]>;
  getTenant(code: string): Promise<Tenant | null>;
  /** Throws DuplicateError if the code exists. */
  insertTenant(t: Tenant): Promise<Tenant>;
  updateTenant(code: string, patch: Partial<Omit<Tenant, 'code' | 'createdAt' | 'createdBy'>>): Promise<Tenant | null>;
  listMembers(filter: { tenantCode?: string; email?: string }): Promise<Member[]>;
  getMember(id: string): Promise<Member | null>;
  insertMember(m: Member): Promise<Member>;
  updateMember(id: string, patch: Partial<Omit<Member, 'id' | 'tenantCode' | 'email'>>): Promise<Member | null>;
  addAudit(e: Omit<AuditEntry, 'id' | 'at'>): Promise<void>;
  listAudit(filter: { tenantCode?: string; limit?: number }): Promise<AuditEntry[]>;
  getCredential(email: string): Promise<Credential | null>;
  setCredential(email: string, passwordHash: string): Promise<Credential>;
}

export class DuplicateError extends Error {}

export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

// ------------------------------------------------------------------ file backend

interface FileShape {
  tenants: Tenant[];
  members: Member[];
  audit: AuditEntry[];
  credentials: Credential[];
}

class FileTenantStore implements TenantStore {
  readonly backend = 'file' as const;
  private file: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dir: string) {
    this.file = path.join(dir, 'tenancy.json');
  }

  private read(): FileShape {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<FileShape>;
      return { tenants: parsed.tenants ?? [], members: parsed.members ?? [], audit: parsed.audit ?? [], credentials: parsed.credentials ?? [] };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { tenants: [], members: [], audit: [], credentials: [] };
      throw err;
    }
  }

  private write(data: FileShape) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file); // atomic replace
  }

  /** Serialise read-modify-write cycles within this process. */
  private mutate<T>(fn: (d: FileShape) => T): Promise<T> {
    const run = this.queue.then(() => {
      const d = this.read();
      const out = fn(d);
      this.write(d);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async listTenants() {
    return this.read().tenants;
  }
  async getTenant(code: string) {
    return this.read().tenants.find((t) => t.code === code) ?? null;
  }
  insertTenant(t: Tenant) {
    return this.mutate((d) => {
      if (d.tenants.some((x) => x.code === t.code)) throw new DuplicateError(`Tenant ${t.code} already exists.`);
      d.tenants.push(t);
      return t;
    });
  }
  updateTenant(code: string, patch: Partial<Tenant>) {
    return this.mutate((d) => {
      const i = d.tenants.findIndex((t) => t.code === code);
      if (i < 0) return null;
      d.tenants[i] = { ...d.tenants[i], ...patch, code };
      return d.tenants[i];
    });
  }
  async listMembers(filter: { tenantCode?: string; email?: string }) {
    return this.read().members.filter(
      (m) => (!filter.tenantCode || m.tenantCode === filter.tenantCode) && (!filter.email || m.email === filter.email),
    );
  }
  async getMember(id: string) {
    return this.read().members.find((m) => m.id === id) ?? null;
  }
  insertMember(m: Member) {
    return this.mutate((d) => {
      if (d.members.some((x) => x.tenantCode === m.tenantCode && x.email === m.email)) {
        throw new DuplicateError(`${m.email} is already in ${m.tenantCode}.`);
      }
      d.members.push(m);
      return m;
    });
  }
  updateMember(id: string, patch: Partial<Member>) {
    return this.mutate((d) => {
      const i = d.members.findIndex((m) => m.id === id);
      if (i < 0) return null;
      const cur = d.members[i];
      d.members[i] = { ...cur, ...patch, id, tenantCode: cur.tenantCode, email: cur.email };
      return d.members[i];
    });
  }
  async addAudit(e: Omit<AuditEntry, 'id' | 'at'>) {
    await this.mutate((d) => {
      d.audit.push({ ...e, id: newId(), at: nowIso() });
      if (d.audit.length > 5000) d.audit.splice(0, d.audit.length - 5000);
    });
  }
  async listAudit(filter: { tenantCode?: string; limit?: number }) {
    return this.read()
      .audit.filter((a) => !filter.tenantCode || a.tenantCode === filter.tenantCode)
      .slice(-(filter.limit ?? 100))
      .reverse();
  }
  async getCredential(email: string) {
    return this.read().credentials.find((c) => c.email === email) ?? null;
  }
  setCredential(email: string, passwordHash: string) {
    return this.mutate((d) => {
      const c: Credential = { email, passwordHash, updatedAt: nowIso() };
      d.credentials = [...d.credentials.filter((x) => x.email !== email), c];
      return c;
    });
  }
}

// ------------------------------------------------------------------ Supabase backend

type Row = Record<string, unknown>;

const tenantFromRow = (r: Row): Tenant => ({
  code: String(r.code),
  name: String(r.name),
  plan: String(r.plan ?? ''),
  seatLimit: Number(r.seat_limit ?? 0),
  status: (r.status as TenantStatus) ?? 'active',
  modules: (r.modules as Record<string, boolean>) ?? {},
  branding: (r.branding as TenantBranding) ?? {},
  createdBy: String(r.created_by ?? ''),
  createdAt: String(r.created_at ?? ''),
});

const tenantToRow = (t: Partial<Tenant>): Row => {
  const row: Row = {};
  if (t.code !== undefined) row.code = t.code;
  if (t.name !== undefined) row.name = t.name;
  if (t.plan !== undefined) row.plan = t.plan;
  if (t.seatLimit !== undefined) row.seat_limit = t.seatLimit;
  if (t.status !== undefined) row.status = t.status;
  if (t.modules !== undefined) row.modules = t.modules;
  if (t.branding !== undefined) row.branding = t.branding;
  if (t.createdBy !== undefined) row.created_by = t.createdBy;
  if (t.createdAt !== undefined) row.created_at = t.createdAt;
  return row;
};

const memberFromRow = (r: Row): Member => ({
  id: String(r.id),
  tenantCode: String(r.tenant_code),
  email: String(r.email),
  name: String(r.name ?? ''),
  role: r.role as Role,
  status: r.status as MemberStatus,
  invitedBy: String(r.invited_by ?? ''),
  invitedAt: String(r.invited_at ?? ''),
  joinedAt: (r.joined_at as string) ?? null,
  lastLoginAt: (r.last_login_at as string) ?? null,
  inviteNonce: (r.invite_nonce as string) ?? null,
});

const memberToRow = (m: Partial<Member>): Row => {
  const map: Record<string, string> = {
    id: 'id', tenantCode: 'tenant_code', email: 'email', name: 'name', role: 'role', status: 'status',
    invitedBy: 'invited_by', invitedAt: 'invited_at', joinedAt: 'joined_at', lastLoginAt: 'last_login_at', inviteNonce: 'invite_nonce',
  };
  const row: Row = {};
  for (const [k, v] of Object.entries(m)) if (v !== undefined && map[k]) row[map[k]] = v;
  return row;
};

class SupabaseTenantStore implements TenantStore {
  readonly backend = 'supabase' as const;
  constructor(private db: SupabaseClient) {}

  private check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
    if (res.error) {
      if (res.error.code === '23505') throw new DuplicateError(res.error.message);
      throw new Error(`[tenantStore] ${res.error.message}`);
    }
    return res.data;
  }

  async listTenants() {
    return (this.check(await this.db.from('tenants').select('*').order('created_at')) as Row[]).map(tenantFromRow);
  }
  async getTenant(code: string) {
    const r = this.check(await this.db.from('tenants').select('*').eq('code', code).maybeSingle()) as Row | null;
    return r ? tenantFromRow(r) : null;
  }
  async insertTenant(t: Tenant) {
    return tenantFromRow(this.check(await this.db.from('tenants').insert(tenantToRow(t)).select().single()) as Row);
  }
  async updateTenant(code: string, patch: Partial<Tenant>) {
    const r = this.check(await this.db.from('tenants').update(tenantToRow(patch)).eq('code', code).select().maybeSingle()) as Row | null;
    return r ? tenantFromRow(r) : null;
  }
  async listMembers(filter: { tenantCode?: string; email?: string }) {
    let q = this.db.from('tenant_members').select('*');
    if (filter.tenantCode) q = q.eq('tenant_code', filter.tenantCode);
    if (filter.email) q = q.eq('email', filter.email);
    return (this.check(await q.order('invited_at')) as Row[]).map(memberFromRow);
  }
  async getMember(id: string) {
    const r = this.check(await this.db.from('tenant_members').select('*').eq('id', id).maybeSingle()) as Row | null;
    return r ? memberFromRow(r) : null;
  }
  async insertMember(m: Member) {
    return memberFromRow(this.check(await this.db.from('tenant_members').insert(memberToRow(m)).select().single()) as Row);
  }
  async updateMember(id: string, patch: Partial<Member>) {
    const { tenantCode: _t, email: _e, id: _i, ...safe } = patch;
    void _t; void _e; void _i;
    const r = this.check(await this.db.from('tenant_members').update(memberToRow(safe)).eq('id', id).select().maybeSingle()) as Row | null;
    return r ? memberFromRow(r) : null;
  }
  async addAudit(e: Omit<AuditEntry, 'id' | 'at'>) {
    this.check(
      await this.db.from('auth_audit_log').insert({
        actor_email: e.actorEmail, tenant_code: e.tenantCode, action: e.action, target: e.target, detail: e.detail,
      }),
    );
  }
  async listAudit(filter: { tenantCode?: string; limit?: number }) {
    let q = this.db.from('auth_audit_log').select('*');
    if (filter.tenantCode) q = q.eq('tenant_code', filter.tenantCode);
    const rows = this.check(await q.order('at', { ascending: false }).limit(filter.limit ?? 100)) as Row[];
    return rows.map((r) => ({
      id: String(r.id), at: String(r.at), actorEmail: String(r.actor_email), tenantCode: String(r.tenant_code),
      action: String(r.action), target: String(r.target ?? ''), detail: (r.detail as Record<string, unknown>) ?? {},
    }));
  }
  async getCredential(email: string) {
    const r = this.check(await this.db.from('user_credentials').select('*').eq('email', email).maybeSingle()) as Row | null;
    return r ? { email: String(r.email), passwordHash: String(r.password_hash), updatedAt: String(r.updated_at) } : null;
  }
  async setCredential(email: string, passwordHash: string) {
    const updatedAt = nowIso();
    this.check(await this.db.from('user_credentials').upsert({ email, password_hash: passwordHash, updated_at: updatedAt }));
    return { email, passwordHash, updatedAt };
  }
}

// ------------------------------------------------------------------ selection

let store: TenantStore | null = null;

export function getTenantStore(): TenantStore {
  if (store) return store;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) {
    store = new SupabaseTenantStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else {
    // In production the file store is only allowed when someone chose a persistent folder on
    // purpose; otherwise a redeploy would silently wipe every workspace, member and password.
    if (process.env.NODE_ENV === 'production' && !process.env.TENANCY_DATA_DIR) {
      throw new Error(
        '[tenantStore] No database configured. Set SUPABASE_SERVICE_ROLE_KEY (recommended) or TENANCY_DATA_DIR pointing at a persistent disk.',
      );
    }
    store = new FileTenantStore(process.env.TENANCY_DATA_DIR || path.join(process.cwd(), '.data'));
  }
  return store;
}
