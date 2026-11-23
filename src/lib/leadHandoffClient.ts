'use client';

/**
 * Browser side of "Assign leads to a teammate" (src/lib/leadHandoffs.ts).
 * - sendLeadHandoff: the sender posts leads for a teammate (in batches of 500).
 * - collectLeadHandoffs: the recipient's browser fetches batches waiting for them, adds the leads to
 *   their own Contacts as a folder, then confirms each batch to the server.
 */
import { createIcpFolderWithLeads, getStoredContacts, type ContactRecord } from '@/lib/leadStore';
import { getStoredSession } from '@/lib/session';
import { getStorageOwner } from '@/lib/tenantStorage';
import {
  MAX_HANDOFF_LEADS,
  dedupeHandoffLeads,
  handoffFolderName,
  sanitiseHandoffLead,
  type LeadHandoffBatch,
  type LeadHandoffSummary,
} from '@/lib/leadHandoffs';

/** Batch ids already added to this person's Contacts in this browser (listed in tenantStorage DATA_KEYS). */
const APPLIED_KEY = 'appointmentlyy_lead_handoffs_applied_v1';
const MAX_APPLIED_IDS = 300;

function readApplied(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(APPLIED_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function rememberApplied(id: string) {
  try {
    const next = [...readApplied().filter((x) => x !== id), id].slice(-MAX_APPLIED_IDS);
    localStorage.setItem(APPLIED_KEY, JSON.stringify(next));
  } catch {
    // storage full or unavailable: de-duplication still stops a second copy
  }
}

async function ack(id: string): Promise<boolean> {
  try {
    const res = await fetch('/api/leads/handoffs/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
      cache: 'no-store',
      credentials: 'same-origin',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface CollectedHandoff {
  id: string;
  fromName: string;
  folderName: string;
  added: number;
  duplicates: number;
}

export interface HandoffRecipient {
  email: string;
  tenantCode: string;
  tenantName: string;
  repName: string;
}

/** True when the Contacts in this browser belong to this person in this workspace right now. */
function storageIsMine(me: HandoffRecipient): boolean {
  const owner = `${me.email.trim().toLowerCase()}|${me.tenantCode}`;
  if (getStorageOwner() !== owner) return false;
  const s = getStoredSession();
  return s.isAuthenticated && s.email.trim().toLowerCase() === me.email.trim().toLowerCase() && s.tenantCode === me.tenantCode;
}

async function collectOnce(me: HandoffRecipient): Promise<CollectedHandoff[]> {
  if (!storageIsMine(me)) return [];
  let batches: LeadHandoffBatch[] = [];
  try {
    const res = await fetch('/api/leads/handoffs', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return [];
    const data = (await res.json()) as { batches?: LeadHandoffBatch[] };
    batches = Array.isArray(data.batches) ? data.batches : [];
  } catch {
    return [];
  }
  const myEmail = me.email.trim().toLowerCase();
  const out: CollectedHandoff[] = [];
  for (const b of batches) {
    // The person or workspace may have changed while the request was in flight.
    if (!storageIsMine(me)) break;
    if (!b || typeof b.id !== 'string' || b.tenantCode !== me.tenantCode || (b.toEmail || '').toLowerCase() !== myEmail) continue;
    if (readApplied().includes(b.id)) {
      // Added on an earlier visit, but the confirmation did not reach the server: confirm only.
      await ack(b.id);
      continue;
    }
    const tag = b.id.replace(/[^a-z0-9]/gi, '').slice(0, 12);
    const clean = (Array.isArray(b.leads) ? b.leads : [])
      .slice(0, MAX_HANDOFF_LEADS)
      .map((l, i) => sanitiseHandoffLead(l, i))
      .filter((l): l is ContactRecord => l !== null)
      // Ids are local to each browser: give the leads ids of their own here (stable per batch).
      .map((l, i) => ({ ...l, id: `handoff_${tag}_${i}` }));
    const { fresh, duplicates } = dedupeHandoffLeads(clean, getStoredContacts());
    const fromName = (b.fromName || '').trim() || 'a teammate';
    const folderName = handoffFolderName(b.folderName, fromName);
    if (fresh.length > 0) {
      createIcpFolderWithLeads({
        folderName,
        tenantCode: me.tenantCode,
        tenantName: me.tenantName,
        createdBy: fromName,
        filtersSummary: {},
        newLeads: fresh.map((l) => {
          const rest: Partial<ContactRecord> = { ...l };
          delete rest.folderId;
          delete rest.folderName;
          delete rest.assignedRep;
          return rest as Omit<ContactRecord, 'folderId' | 'folderName' | 'assignedRep'>;
        }),
        selectedReps: [me.repName || me.email],
        origin: { footprintTitle: `Assigned by ${fromName}`, source: 'Assigned by a teammate' },
      });
    }
    rememberApplied(b.id);
    await ack(b.id);
    out.push({ id: b.id, fromName, folderName, added: fresh.length, duplicates });
  }
  return out;
}

let running: Promise<CollectedHandoff[]> | null = null;

/**
 * Fetch and apply the batches waiting for this person. Safe to call often and from several tabs:
 * one run at a time per tab, one tab at a time per browser (Web Locks), applied batch ids are
 * remembered, and leads already in Contacts are skipped, so a retry never adds a second copy.
 */
export function collectLeadHandoffs(me: HandoffRecipient): Promise<CollectedHandoff[]> {
  if (typeof window === 'undefined') return Promise.resolve([]);
  if (running) return running;
  const run = async () => {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks?.request) return (await locks.request('appy-lead-handoffs', () => collectOnce(me))) as CollectedHandoff[];
    return collectOnce(me);
  };
  running = run()
    .catch(() => [] as CollectedHandoff[])
    .finally(() => {
      running = null;
    });
  return running;
}

/** One line for the recipient's toast. */
export function describeCollected(c: CollectedHandoff): string {
  if (c.added === 0) return `Leads from ${c.fromName} were already in your Contacts.`;
  const base = `${c.added} new lead${c.added === 1 ? '' : 's'} from ${c.fromName}`;
  return c.duplicates > 0 ? `${base} (${c.duplicates} already in your Contacts).` : `${base}.`;
}

// ------------------------------------------------------------------ sender

export interface SendHandoffResult {
  ok: boolean;
  sent: number;
  recipientName: string;
  error?: string;
}

/** Send leads to a teammate, 500 per batch. Stops at the first batch the server refuses. */
export async function sendLeadHandoff(params: { toEmail: string; folderName: string; leads: ContactRecord[] }): Promise<SendHandoffResult> {
  const parts: ContactRecord[][] = [];
  for (let i = 0; i < params.leads.length; i += MAX_HANDOFF_LEADS) parts.push(params.leads.slice(i, i + MAX_HANDOFF_LEADS));
  let sent = 0;
  let recipientName = '';
  for (const [i, leads] of parts.entries()) {
    const folderName = parts.length > 1 ? `${params.folderName.slice(0, 60)} (part ${i + 1} of ${parts.length})` : params.folderName;
    let data: { success?: boolean; error?: string; recipientName?: string; handoff?: LeadHandoffSummary } = {};
    let okStatus = false;
    try {
      const res = await fetch('/api/leads/handoffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: params.toEmail, folderName, leads }),
        cache: 'no-store',
        credentials: 'same-origin',
      });
      okStatus = res.ok;
      data = await res.json().catch(() => ({}));
    } catch {
      okStatus = false;
    }
    if (!okStatus || !data.success) {
      const error = data.error || 'Could not send the leads. Please try again.';
      return { ok: false, sent, recipientName, error: sent > 0 ? `${error} ${sent} of ${params.leads.length} leads were sent before this.` : error };
    }
    sent += data.handoff?.leadCount ?? leads.length;
    recipientName = data.recipientName || recipientName;
  }
  return { ok: true, sent, recipientName };
}
