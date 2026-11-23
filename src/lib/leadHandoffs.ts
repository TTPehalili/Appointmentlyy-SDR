/**
 * "Assign leads to a teammate": the shape of a hand-off batch and the rules both sides share.
 *
 * Contacts live in each person's own browser (leadStore), so one person cannot write into another's
 * list. A sender (Admin and above) posts a batch to the server; the recipient's browser collects it
 * the next time they open the app, adds the leads to their own Contacts as a folder, and confirms.
 *
 * This file has no imports with side effects: the server sanitises with it, the browser de-duplicates
 * with it and the regression test loads it directly.
 */
import type { ContactRecord, LeadFootprintItem } from '@/lib/leadStore';
import { LEAD_ACTIVITY_CHECKLIST } from '@/lib/leadActivityChecklist';

export const MAX_HANDOFF_LEADS = 500;
export const MAX_HANDOFF_FOLDER_NAME = 80;
/** Request body ceiling for one batch (500 full records fit comfortably). */
export const MAX_HANDOFF_BODY_CHARS = 3_000_000;
const MAX_FOOTPRINT_ITEMS = 10;

export interface LeadHandoffBatch {
  id: string;
  tenantCode: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  folderName: string;
  leads: ContactRecord[];
  leadCount: number;
  createdAt: string;
  deliveredAt: string | null;
}

/** What a sender sees about a batch they sent: never the leads themselves. */
export type LeadHandoffSummary = Omit<LeadHandoffBatch, 'leads'>;

export const summariseHandoff = (b: LeadHandoffBatch): LeadHandoffSummary => ({
  id: b.id,
  tenantCode: b.tenantCode,
  fromEmail: b.fromEmail,
  fromName: b.fromName,
  toEmail: b.toEmail,
  folderName: b.folderName,
  leadCount: b.leadCount,
  createdAt: b.createdAt,
  deliveredAt: b.deliveredAt,
});

// Control characters (tabs and new lines are kept only where a field is multi-line).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const text = (v: unknown, max: number, multiline = false): string => {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  let s = String(v).replace(CONTROL, '');
  if (!multiline) s = s.replace(/[\r\n\t]+/g, ' ');
  return s.trim().slice(0, max);
};
const count = (v: unknown, max: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : 0;
};
/** Only http(s) links survive: a "javascript:" link must never reach an href. */
const link = (v: unknown, max: number): string => {
  const s = text(v, max);
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? '' : s;
};

const FOOTPRINT_TYPES: LeadFootprintItem['type'][] = ['call', 'email', 'linkedin', 'note', 'status'];
const ACTIVITY_KEYS: ReadonlySet<string> = new Set(LEAD_ACTIVITY_CHECKLIST.flatMap((g) => g.items.map((i) => i.key)));

function sanitiseFootprint(v: unknown): LeadFootprintItem[] {
  if (!Array.isArray(v)) return [];
  const out: LeadFootprintItem[] = [];
  for (const raw of v.slice(0, MAX_FOOTPRINT_ITEMS)) {
    if (!raw || typeof raw !== 'object') continue;
    const f = raw as Record<string, unknown>;
    const type = FOOTPRINT_TYPES.includes(f.type as LeadFootprintItem['type']) ? (f.type as LeadFootprintItem['type']) : 'note';
    const item: LeadFootprintItem = {
      id: text(f.id, 80) || `fp_${out.length}`,
      timestamp: text(f.timestamp, 60),
      isoDate: text(f.isoDate, 40),
      type,
      title: text(f.title, 120),
      summary: text(f.summary, 600, true),
      repName: text(f.repName, 80),
    };
    const disposition = text(f.disposition, 80);
    if (disposition) item.disposition = disposition;
    // Activity checklist ticks keep their key (known keys only), so the history still counts as ticks.
    if (typeof f.activityKey === 'string' && ACTIVITY_KEYS.has(f.activityKey)) item.activityKey = f.activityKey;
    out.push(item);
  }
  return out;
}

/**
 * One lead, rebuilt field by field: anything that is not part of the contact shape is dropped, every
 * text field is capped, and owner / folder / workspace fields are blanked (the recipient's browser
 * sets them). Returns null for a row with nothing to identify a person.
 */
export function sanitiseHandoffLead(raw: unknown, index: number): ContactRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const name = text(r.name, 120);
  const email = text(r.email, 254);
  const phone = text(r.phone, 40);
  const company = text(r.company, 160);
  if (!name && !email && !phone) return null;
  const lead: ContactRecord = {
    id: text(r.id, 80) || `lead_${index}`,
    name: name || 'Prospect',
    company,
    title: text(r.title, 160),
    department: text(r.department, 80),
    email,
    phone,
    headcount: text(r.headcount, 40),
    website: link(r.website, 200),
    linkedinUrl: link(r.linkedinUrl, 300),
    assignedRep: '',
    tenantId: '',
    status: text(r.status, 60) || 'New Lead',
    cadenceDay: count(r.cadenceDay, 365) || 1,
    touchNumber: count(r.touchNumber, 999),
    leadNotes: text(r.leadNotes, 2000, true),
    footprint: sanitiseFootprint(r.footprint),
  };
  const industry = text(r.industry, 120);
  if (industry) lead.industry = industry;
  const location = text(r.location, 160);
  if (location) lead.location = location;
  const committeeRole = text(r.committeeRole, 40);
  if (committeeRole) lead.committeeRole = committeeRole;
  const dealValue = typeof r.dealValue === 'number' && Number.isFinite(r.dealValue) && r.dealValue >= 0 ? Math.min(r.dealValue, 1_000_000_000) : null;
  if (dealValue !== null) lead.dealValue = dealValue;
  return lead;
}

export type HandoffInput =
  | { ok: true; toEmail: string; folderName: string; leads: ContactRecord[] }
  | { ok: false; status: number; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Check and clean a "create batch" request body. */
export function validateHandoffInput(body: Record<string, unknown>): HandoffInput {
  const toEmail = text(body.toEmail, 254).toLowerCase();
  if (!EMAIL_RE.test(toEmail)) return { ok: false, status: 400, error: 'Choose a teammate to send the leads to.' };
  if (!Array.isArray(body.leads) || body.leads.length === 0) return { ok: false, status: 400, error: 'There are no leads to send.' };
  if (body.leads.length > MAX_HANDOFF_LEADS) {
    return { ok: false, status: 413, error: `You can send up to ${MAX_HANDOFF_LEADS} leads at a time.` };
  }
  const leads = body.leads.map((l, i) => sanitiseHandoffLead(l, i)).filter((l): l is ContactRecord => l !== null);
  if (leads.length === 0) return { ok: false, status: 400, error: 'None of these leads has a name, email or phone number.' };
  const folderName = text(body.folderName, MAX_HANDOFF_FOLDER_NAME) || 'Assigned leads';
  return { ok: true, toEmail, folderName, leads };
}

// ------------------------------------------------------------------ de-duplication (recipient side)

const emailKey = (c: { email?: string }) => (c.email || '').trim().toLowerCase();
const phoneKey = (c: { phone?: string }) => {
  const d = (c.phone || '').replace(/\D+/g, '');
  return d.length >= 7 ? d : '';
};
const nameKey = (c: { name?: string; company?: string }) => {
  const n = (c.name || '').trim().toLowerCase();
  const co = (c.company || '').trim().toLowerCase();
  return n && co ? `${n}|${co}` : '';
};

/**
 * The leads from `incoming` that the person does not have yet. A lead with an email is matched by
 * email only; without one, by phone; without either, by name + company. Repeats inside the batch
 * count as duplicates too.
 */
export function dedupeHandoffLeads<T extends { email?: string; phone?: string; name?: string; company?: string }>(
  incoming: T[],
  existing: { email?: string; phone?: string; name?: string; company?: string }[],
): { fresh: T[]; duplicates: number } {
  const emails = new Set<string>();
  const phones = new Set<string>();
  const names = new Set<string>();
  const remember = (c: { email?: string; phone?: string; name?: string; company?: string }) => {
    const e = emailKey(c);
    const p = phoneKey(c);
    const n = nameKey(c);
    if (e) emails.add(e);
    if (p) phones.add(p);
    if (n) names.add(n);
  };
  existing.forEach(remember);
  const fresh: T[] = [];
  let duplicates = 0;
  for (const lead of incoming) {
    const e = emailKey(lead);
    const p = phoneKey(lead);
    const n = nameKey(lead);
    const known = e ? emails.has(e) : p ? phones.has(p) : n ? names.has(n) : false;
    if (known) {
      duplicates += 1;
      continue;
    }
    remember(lead);
    fresh.push(lead);
  }
  return { fresh, duplicates };
}

/** Folder the recipient sees: "<folder> (from <sender>)". */
export function handoffFolderName(folderName: string, fromName: string): string {
  const base = (folderName || 'Assigned leads').trim();
  const from = (fromName || 'a teammate').trim();
  return `${base} (from ${from})`;
}

/** Who may send leads to a teammate: Admin and above; in the platform's own workspace, platform staff only. */
export function canSendLeadHandoffs(who: { role?: string | null; tenantCode?: string | null; isPlatformAdmin?: boolean } | null | undefined): boolean {
  if (!who) return false;
  if (who.isPlatformAdmin) return true;
  if ((who.tenantCode || '') === 'APPOINTMENTLYY') return false;
  return who.role === 'Admin' || who.role === 'Super Admin';
}
