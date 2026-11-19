/**
 * Server only. Workspace provider-key TEST RESULTS: pass/fail and when, per workspace and provider. Never a key, a key
 * fragment, a hash of a key or a provider message. Written by POST /api/byok/validate when a workspace admin runs
 * "Test connection" in their own workspace; read by Client Projects (the provider-keys card shows "test passed").
 *
 * Same two backends as the other stores: Supabase (table tenant_key_checks, migration 20261127000000_client_intake.sql)
 * or a JSON file under TENANCY_DATA_DIR (key_checks.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const KEY_CHECK_PROVIDERS = ['claude', 'openai', 'gemini', 'elevenlabs', 'resend'] as const;
export type KeyCheckProvider = (typeof KEY_CHECK_PROVIDERS)[number];
export interface KeyCheck {
  tenantCode: string;
  provider: KeyCheckProvider;
  ok: boolean;
  checkedAt: string;
  checkedBy: string;
}
const TENANT_RE = /^[A-Z0-9][A-Z0-9-]{1,31}$/;
export const isKeyProvider = (v: unknown): v is KeyCheckProvider => (KEY_CHECK_PROVIDERS as readonly unknown[]).includes(v);

interface KeyCheckStore {
  record(c: KeyCheck): Promise<void>;
  list(tenantCode: string): Promise<KeyCheck[]>;
}

class FileKeyChecks implements KeyCheckStore {
  private file: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(dir: string) {
    this.file = path.join(dir, 'key_checks.json');
  }
  private read(): KeyCheck[] {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8')) as KeyCheck[];
      return Array.isArray(d) ? d : [];
    } catch {
      return [];
    }
  }
  record(c: KeyCheck) {
    const run = this.queue.then(() => {
      const rows = this.read().filter((x) => !(x.tenantCode === c.tenantCode && x.provider === c.provider));
      rows.push(c);
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(rows), 'utf8');
      fs.renameSync(tmp, this.file);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  async list(tenantCode: string) {
    return this.read().filter((x) => x.tenantCode === tenantCode);
  }
}

class SupabaseKeyChecks implements KeyCheckStore {
  constructor(private db: SupabaseClient) {}
  async record(c: KeyCheck) {
    const { error } = await this.db.from('tenant_key_checks').upsert({ tenant_code: c.tenantCode, provider: c.provider, ok: c.ok, checked_at: c.checkedAt, checked_by: c.checkedBy.slice(0, 254) }, { onConflict: 'tenant_code,provider' });
    if (error) throw new Error(`[keyChecks] ${error.message}`);
  }
  async list(tenantCode: string) {
    const { data, error } = await this.db.from('tenant_key_checks').select('tenant_code, provider, ok, checked_at, checked_by').eq('tenant_code', tenantCode).limit(20);
    // Before the intake migration the table is missing: no results yet (never an error on a read).
    if (error) return [];
    return (data ?? []).map((r) => ({ tenantCode: String(r.tenant_code), provider: r.provider as KeyCheckProvider, ok: r.ok === true, checkedAt: new Date(String(r.checked_at)).toISOString(), checkedBy: String(r.checked_by ?? '') }));
  }
}

let store: KeyCheckStore | null = null;
function keyChecks(): KeyCheckStore {
  if (store) return store;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  store = url && key ? new SupabaseKeyChecks(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })) : new FileKeyChecks(process.env.TENANCY_DATA_DIR || path.join(process.cwd(), '.data'));
  return store;
}

/** Record one "Test connection" outcome. Never throws (a failed record must not break the key test itself). */
export async function recordKeyCheck(tenantCode: string, provider: unknown, ok: boolean, by: string): Promise<void> {
  if (!TENANT_RE.test(tenantCode) || !isKeyProvider(provider)) return;
  try {
    await keyChecks().record({ tenantCode, provider, ok, checkedAt: new Date().toISOString(), checkedBy: by });
  } catch (err) {
    console.error('[keyChecks record]', err instanceof Error ? err.message : err);
  }
}

export async function listKeyChecks(tenantCode: string): Promise<KeyCheck[]> {
  if (!TENANT_RE.test(tenantCode)) return [];
  return keyChecks().list(tenantCode);
}
