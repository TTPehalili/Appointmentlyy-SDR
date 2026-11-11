/**
 * Server copy of each workspace's call dispositions (server-only), keyed by the session's tenant
 * code. One workspace never reads or changes another's list.
 *
 * In memory per server process on purpose: the browser's list (src/lib/dispositionStore.ts,
 * localStorage) is what the Dialer and the admin screen use, and nothing reads this copy back yet,
 * so it needs no table. If a screen starts reading it, move it to a Supabase + file store like
 * emailTemplateStore.
 */
import {
  INITIAL_DEFAULT_DISPOSITIONS,
  type ActionTrigger,
  type CallDisposition,
  type DispositionCategory,
} from '@/lib/dispositionStore';

export const MAX_DISPOSITIONS_PER_WORKSPACE = 200;

const CATEGORIES: DispositionCategory[] = ['Positive', 'Follow-up', 'Negative', 'Compliance', 'Unreached'];
const TRIGGERS: ActionTrigger[] = ['mark_booked', 'schedule_callback', 'dnc_quarantine', 'resend_email_120s', 'recycle_cadence', 'none'];

const str = (v: unknown, max: number): string | null => (typeof v === 'string' ? v.trim().slice(0, max) : null);

/** A clean copy of one disposition from a request body, or an error naming the bad field. */
export function cleanDisposition(raw: unknown): { ok: true; value: CallDisposition } | { ok: false; field: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, field: 'disposition' };
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 80);
  if (!id || !/^[A-Za-z0-9_.:-]+$/.test(id)) return { ok: false, field: 'id' };
  const name = str(r.name, 120);
  if (!name) return { ok: false, field: 'name' };
  const code = str(r.code, 64) ?? '';
  const campaign = str(r.campaign, 120) ?? '';
  const category = r.category as DispositionCategory;
  if (!CATEGORIES.includes(category)) return { ok: false, field: 'category' };
  const actionTrigger = r.actionTrigger as ActionTrigger;
  if (!TRIGGERS.includes(actionTrigger)) return { ok: false, field: 'actionTrigger' };
  const color = str(r.color, 9) ?? '';
  if (color && !/^#[0-9a-fA-F]{3,8}$/.test(color)) return { ok: false, field: 'color' };
  const pipelineStageId = r.pipelineStageId === undefined || r.pipelineStageId === null || r.pipelineStageId === '' ? undefined : str(r.pipelineStageId, 80);
  if (pipelineStageId === null) return { ok: false, field: 'pipelineStageId' };
  return {
    ok: true,
    value: {
      id,
      code,
      name,
      campaign,
      category,
      actionTrigger,
      rebuttalScriptPrompt: str(r.rebuttalScriptPrompt, 2000) ?? '',
      requiresNote: r.requiresNote === true,
      isActive: r.isActive !== false,
      color: color || '#64748B',
      updatedAt: str(r.updatedAt, 40) ?? '',
      ...(pipelineStageId ? { pipelineStageId } : {}),
    },
  };
}

const lists = new Map<string, CallDisposition[]>();

export function listDispositions(tenantCode: string): CallDisposition[] {
  return lists.get(tenantCode) ?? INITIAL_DEFAULT_DISPOSITIONS.map((d) => ({ ...d }));
}

export function replaceDispositions(tenantCode: string, next: CallDisposition[]) {
  lists.set(tenantCode, next.slice(0, MAX_DISPOSITIONS_PER_WORKSPACE));
}

/** Insert or update by id. False when a new one would exceed the per-workspace cap. */
export function upsertDisposition(tenantCode: string, d: CallDisposition): boolean {
  const cur = listDispositions(tenantCode);
  const i = cur.findIndex((x) => x.id === d.id);
  if (i >= 0) cur[i] = d;
  else {
    if (cur.length >= MAX_DISPOSITIONS_PER_WORKSPACE) return false;
    cur.unshift(d);
  }
  lists.set(tenantCode, cur);
  return true;
}

export function removeDisposition(tenantCode: string, id: string): boolean {
  const cur = listDispositions(tenantCode);
  const next = cur.filter((d) => d.id !== id);
  lists.set(tenantCode, next);
  return next.length !== cur.length;
}
