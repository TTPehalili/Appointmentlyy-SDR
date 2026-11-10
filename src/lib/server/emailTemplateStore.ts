/**
 * Server-only storage for the email template library, shared by everyone in a workspace. Same two
 * backends as tenantStore, integrationStore and announcementStore: Supabase (table in
 * supabase/migrations/20261112000000_email_templates.sql) or a JSON file
 * (TENANCY_DATA_DIR/email_templates.json) for local work.
 *
 * Every method takes the tenant code and scopes by it: a template id from another workspace is
 * simply "not found".
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { newId, nowIso } from '@/lib/server/tenantStore';
import type { EmailTemplate, TemplateInput, TemplatePurpose, TemplateVisibility } from '@/lib/emailTemplates';

export interface EmailTemplateStore {
  readonly backend: 'supabase' | 'file';
  /** Every template in the workspace (archived and private ones too); callers filter by viewer. */
  list(tenantCode: string): Promise<EmailTemplate[]>;
  get(tenantCode: string, id: string): Promise<EmailTemplate | null>;
  create(tenantCode: string, input: TemplateInput, createdBy: string): Promise<EmailTemplate>;
  update(tenantCode: string, id: string, input: TemplateInput): Promise<EmailTemplate | null>;
  remove(tenantCode: string, id: string): Promise<boolean>;
  /** Insert sample templates with fixed ids; existing ids are left alone (safe to call twice). */
  seed(tenantCode: string, templates: (TemplateInput & { id: string })[], createdBy: string): Promise<void>;
}

/** Cap per workspace, so a runaway script can't fill the store. */
export const MAX_TEMPLATES_PER_WORKSPACE = 1000;

export class TemplateLimitError extends Error {}

const byName = (a: EmailTemplate, b: EmailTemplate) =>
  a.campaign.localeCompare(b.campaign) || (a.sequenceStep ?? 99) - (b.sequenceStep ?? 99) || a.name.localeCompare(b.name);

// ------------------------------------------------------------------ file backend

class FileEmailTemplateStore implements EmailTemplateStore {
  readonly backend = 'file' as const;
  private file: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(dir: string) {
    this.file = path.join(dir, 'email_templates.json');
  }
  private read(): EmailTemplate[] {
    try {
      const p = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { templates?: EmailTemplate[] };
      return p.templates ?? [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }
  private write(templates: EmailTemplate[]) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ templates }, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (d: EmailTemplate[]) => T): Promise<T> {
    const run = this.queue.then(() => {
      const d = this.read();
      const out = fn(d);
      this.write(d);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  async list(tenantCode: string) {
    return this.read().filter((t) => t.tenantCode === tenantCode).sort(byName);
  }
  async get(tenantCode: string, id: string) {
    return this.read().find((t) => t.tenantCode === tenantCode && t.id === id) ?? null;
  }
  create(tenantCode: string, input: TemplateInput, createdBy: string) {
    return this.mutate((d) => {
      if (d.filter((t) => t.tenantCode === tenantCode).length >= MAX_TEMPLATES_PER_WORKSPACE) {
        throw new TemplateLimitError('This workspace has reached the template limit. Archive or delete some first.');
      }
      const now = nowIso();
      const t: EmailTemplate = { ...input, id: newId(), tenantCode, createdBy, createdAt: now, updatedAt: now };
      d.push(t);
      return t;
    });
  }
  update(tenantCode: string, id: string, input: TemplateInput) {
    return this.mutate((d) => {
      const i = d.findIndex((t) => t.tenantCode === tenantCode && t.id === id);
      if (i < 0) return null;
      const cur = d[i];
      d[i] = { ...cur, ...input, id, tenantCode, createdBy: cur.createdBy, createdAt: cur.createdAt, updatedAt: nowIso() };
      return d[i];
    });
  }
  remove(tenantCode: string, id: string) {
    return this.mutate((d) => {
      const i = d.findIndex((t) => t.tenantCode === tenantCode && t.id === id);
      if (i < 0) return false;
      d.splice(i, 1);
      return true;
    });
  }
  async seed(tenantCode: string, templates: (TemplateInput & { id: string })[], createdBy: string) {
    await this.mutate((d) => {
      const now = nowIso();
      for (const s of templates) {
        if (d.some((t) => t.id === s.id)) continue;
        d.push({ ...s, tenantCode, createdBy, createdAt: now, updatedAt: now });
      }
    });
  }
}

// ------------------------------------------------------------------ Supabase backend

type Row = Record<string, unknown>;
const TABLE = 'email_templates';

const fromRow = (r: Row): EmailTemplate => ({
  id: String(r.id),
  tenantCode: String(r.tenant_code),
  name: String(r.name ?? ''),
  subject: String(r.subject ?? ''),
  body: String(r.body ?? ''),
  frameworkId: String(r.framework_id ?? ''),
  campaign: String(r.campaign ?? ''),
  purpose: (r.purpose as TemplatePurpose) ?? 'cold',
  outcomeTags: Array.isArray(r.outcome_tags) ? (r.outcome_tags as unknown[]).map(String) : [],
  visibility: (r.visibility as TemplateVisibility) ?? 'team',
  assignedTo: Array.isArray(r.assigned_to) ? (r.assigned_to as unknown[]).map(String) : [],
  sequenceStep: r.sequence_step === null || r.sequence_step === undefined ? null : Number(r.sequence_step),
  createdBy: String(r.created_by ?? ''),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  archived: r.archived === true,
});

const toRow = (t: TemplateInput): Row => ({
  name: t.name,
  subject: t.subject,
  body: t.body,
  framework_id: t.frameworkId,
  campaign: t.campaign || null,
  purpose: t.purpose,
  outcome_tags: t.outcomeTags,
  visibility: t.visibility,
  assigned_to: t.assignedTo,
  sequence_step: t.sequenceStep,
  archived: t.archived,
});

class SupabaseEmailTemplateStore implements EmailTemplateStore {
  readonly backend = 'supabase' as const;
  constructor(private db: SupabaseClient) {}
  private check<T>(res: { data: T; error: { message: string } | null }): T {
    if (res.error) throw new Error(`[emailTemplateStore] ${res.error.message}`);
    return res.data;
  }
  async list(tenantCode: string) {
    const rows = this.check(
      await this.db.from(TABLE).select('*').eq('tenant_code', tenantCode).order('updated_at', { ascending: false }).limit(MAX_TEMPLATES_PER_WORKSPACE),
    ) as Row[];
    return rows.map(fromRow).sort(byName);
  }
  async get(tenantCode: string, id: string) {
    const r = this.check(await this.db.from(TABLE).select('*').eq('tenant_code', tenantCode).eq('id', id).maybeSingle()) as Row | null;
    return r ? fromRow(r) : null;
  }
  async create(tenantCode: string, input: TemplateInput, createdBy: string) {
    const { count, error } = await this.db.from(TABLE).select('id', { count: 'exact', head: true }).eq('tenant_code', tenantCode);
    if (error) throw new Error(`[emailTemplateStore] ${error.message}`);
    if ((count ?? 0) >= MAX_TEMPLATES_PER_WORKSPACE) {
      throw new TemplateLimitError('This workspace has reached the template limit. Archive or delete some first.');
    }
    const r = this.check(await this.db.from(TABLE).insert({ ...toRow(input), tenant_code: tenantCode, created_by: createdBy }).select().single()) as Row;
    return fromRow(r);
  }
  async update(tenantCode: string, id: string, input: TemplateInput) {
    const r = this.check(
      await this.db.from(TABLE).update({ ...toRow(input), updated_at: nowIso() }).eq('tenant_code', tenantCode).eq('id', id).select().maybeSingle(),
    ) as Row | null;
    return r ? fromRow(r) : null;
  }
  async remove(tenantCode: string, id: string) {
    const rows = this.check(await this.db.from(TABLE).delete().eq('tenant_code', tenantCode).eq('id', id).select('id')) as Row[] | null;
    return Boolean(rows && rows.length);
  }
  async seed(tenantCode: string, templates: (TemplateInput & { id: string })[], createdBy: string) {
    this.check(
      await this.db
        .from(TABLE)
        .upsert(
          templates.map((t) => ({ ...toRow(t), id: t.id, tenant_code: tenantCode, created_by: createdBy })),
          { onConflict: 'id', ignoreDuplicates: true },
        ),
    );
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids are UUIDs in both backends; reject anything else before it reaches a query. */
export const isTemplateId = (id: string) => UUID_RE.test(id);

/** Stable UUID for a sample template, so seeding twice (or from two servers at once) inserts it once. */
export function seedId(tenantCode: string, key: string): string {
  const h = crypto.createHash('sha256').update(`email-template-seed:${tenantCode}:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

let store: EmailTemplateStore | null = null;
export function getEmailTemplateStore(): EmailTemplateStore {
  if (store) return store;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) {
    store = new SupabaseEmailTemplateStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else {
    if (process.env.NODE_ENV === 'production' && !process.env.TENANCY_DATA_DIR) {
      throw new Error('[emailTemplateStore] No database configured. Set SUPABASE_SERVICE_ROLE_KEY or TENANCY_DATA_DIR.');
    }
    store = new FileEmailTemplateStore(process.env.TENANCY_DATA_DIR || path.join(process.cwd(), '.data'));
  }
  return store;
}
