/**
 * Server-only map of workspace members to their VICIdial agent usernames, set by workspace Admins in
 * Admin › Phone system. The relay (/api/telephony/vicidial/*) only lets a person drive the agent
 * linked to them here (Supervisors and above: any agent linked in their own workspace).
 *
 * The VICIdial server is one shared account, so an agent username can be linked to only one person
 * across every workspace. Same two backends as announcementStore: Supabase (table in
 * supabase/migrations/20261116000000_telephony_agents.sql) or a JSON file
 * (TENANCY_DATA_DIR/telephony_agents.json) for local work.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { nowIso } from '@/lib/server/tenantStore';

export interface AgentLink {
  tenantCode: string;
  email: string;
  agentUser: string;
  updatedBy: string;
  updatedAt: string;
}

/** Thrown when the agent username is already linked to someone else. */
export class AgentTakenError extends Error {
  constructor() {
    super('That VICIdial agent is already linked to someone else.');
  }
}

export interface TelephonyAgentStore {
  readonly backend: 'supabase' | 'file';
  listForTenant(tenantCode: string): Promise<AgentLink[]>;
  getForMember(tenantCode: string, email: string): Promise<AgentLink | null>;
  /** Who the agent username is linked to, in any workspace (case-insensitive). */
  getByAgentUser(agentUser: string): Promise<AgentLink | null>;
  /** Link (or, with an empty agentUser, unlink) a member. */
  set(tenantCode: string, email: string, agentUser: string, updatedBy: string): Promise<AgentLink | null>;
}

const lc = (s: string) => s.trim().toLowerCase();

// ------------------------------------------------------------------ file backend

class FileTelephonyAgentStore implements TelephonyAgentStore {
  readonly backend = 'file' as const;
  private file: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(dir: string) {
    this.file = path.join(dir, 'telephony_agents.json');
  }
  private read(): AgentLink[] {
    try {
      return (JSON.parse(fs.readFileSync(this.file, 'utf8')) as { links?: AgentLink[] }).links ?? [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }
  private write(links: AgentLink[]) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ links }, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }
  async listForTenant(tenantCode: string) {
    return this.read().filter((l) => l.tenantCode === tenantCode);
  }
  async getForMember(tenantCode: string, email: string) {
    return this.read().find((l) => l.tenantCode === tenantCode && l.email === lc(email)) ?? null;
  }
  async getByAgentUser(agentUser: string) {
    return this.read().find((l) => lc(l.agentUser) === lc(agentUser)) ?? null;
  }
  set(tenantCode: string, email: string, agentUser: string, updatedBy: string) {
    const run = this.queue.then(() => {
      const links = this.read();
      const who = lc(email);
      const rest = links.filter((l) => !(l.tenantCode === tenantCode && l.email === who));
      if (!agentUser.trim()) {
        this.write(rest);
        return null;
      }
      if (rest.some((l) => lc(l.agentUser) === lc(agentUser))) throw new AgentTakenError();
      const link: AgentLink = { tenantCode, email: who, agentUser: agentUser.trim(), updatedBy, updatedAt: nowIso() };
      this.write([...rest, link]);
      return link;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

// ------------------------------------------------------------------ Supabase backend

type Row = Record<string, unknown>;
const TABLE = 'telephony_agents';

const fromRow = (r: Row): AgentLink => ({
  tenantCode: String(r.tenant_code),
  email: String(r.member_email),
  agentUser: String(r.agent_user),
  updatedBy: String(r.updated_by ?? ''),
  updatedAt: String(r.updated_at),
});

class SupabaseTelephonyAgentStore implements TelephonyAgentStore {
  readonly backend = 'supabase' as const;
  constructor(private db: SupabaseClient) {}
  private check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
    if (res.error) {
      if (res.error.code === '23505') throw new AgentTakenError();
      throw new Error(`[telephonyAgentStore] ${res.error.message}`);
    }
    return res.data;
  }
  async listForTenant(tenantCode: string) {
    const rows = this.check(await this.db.from(TABLE).select('*').eq('tenant_code', tenantCode).limit(2000)) as Row[];
    return rows.map(fromRow);
  }
  async getForMember(tenantCode: string, email: string) {
    const r = this.check(
      await this.db.from(TABLE).select('*').eq('tenant_code', tenantCode).eq('member_email', lc(email)).maybeSingle(),
    ) as Row | null;
    return r ? fromRow(r) : null;
  }
  async getByAgentUser(agentUser: string) {
    // Usernames are validated to [A-Za-z0-9._-], so ilike without wildcards is an exact, case-blind match.
    const rows = this.check(await this.db.from(TABLE).select('*').ilike('agent_user', agentUser.trim().replace(/[%_\\]/g, '\\$&')).limit(1)) as Row[];
    return rows[0] ? fromRow(rows[0]) : null;
  }
  async set(tenantCode: string, email: string, agentUser: string, updatedBy: string) {
    const who = lc(email);
    if (!agentUser.trim()) {
      this.check(await this.db.from(TABLE).delete().eq('tenant_code', tenantCode).eq('member_email', who));
      return null;
    }
    const r = this.check(
      await this.db
        .from(TABLE)
        .upsert(
          { tenant_code: tenantCode, member_email: who, agent_user: agentUser.trim(), updated_by: updatedBy, updated_at: nowIso() },
          { onConflict: 'tenant_code,member_email' },
        )
        .select()
        .single(),
    ) as Row;
    return fromRow(r);
  }
}

let store: TelephonyAgentStore | null = null;
export function getTelephonyAgentStore(): TelephonyAgentStore {
  if (store) return store;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) {
    store = new SupabaseTelephonyAgentStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else {
    if (process.env.NODE_ENV === 'production' && !process.env.TENANCY_DATA_DIR) {
      throw new Error('[telephonyAgentStore] No database configured. Set SUPABASE_SERVICE_ROLE_KEY or TENANCY_DATA_DIR.');
    }
    store = new FileTelephonyAgentStore(process.env.TENANCY_DATA_DIR || path.join(process.cwd(), '.data'));
  }
  return store;
}
