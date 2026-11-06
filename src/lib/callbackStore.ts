/**
 * Callback Task Store
 *
 * Local (dev and demo) data layer for callback tasks created from the dialer's
 * "Callback" outcome. Mirrors the shape of public.callback_tasks in
 * supabase/migrations/20261106000000_callback_tasks.sql so it can be swapped for
 * Supabase later. Same pattern as activityStore / leadStore: localStorage plus a
 * BroadcastChannel so other tabs (and the assignee's queue) update live.
 *
 * Reps are identified by display name here, like ContactRecord.assignedRep.
 * Tasks are scoped to the org through tenantCode (normalizeTenantKey).
 */

import { canUserReassignLeads } from './session';
import { recordContactTouch } from './leadStore';

export type CallbackStatus = 'open' | 'done' | 'cancelled';

export interface CallbackTaskEvent {
  id: string;
  at: string; // ISO
  actor: string;
  type: 'created' | 'reassigned' | 'completed' | 'reopened';
  fromRep?: string;
  toRep?: string;
}

export interface CallbackTask {
  id: string;
  tenantCode: string;
  contactId: string; // ContactRecord.id, or the lead email when no id exists
  contactName: string;
  companyName: string;
  phone?: string;
  email?: string;
  dueAt: string; // ISO (UTC)
  timeZone: string; // IANA zone of the rep who scheduled it
  note: string;
  disposition: string;
  createdBy: string;
  assignedTo: string;
  status: CallbackStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  activityId?: string;
  events: CallbackTaskEvent[];
}

export const CALLBACK_DISPOSITION = 'Call Back Later';

const STORAGE_KEY = 'appointmentlyy_callback_tasks_v1';
const BROADCAST_CHANNEL_NAME = 'appointmentlyy_callback_sync';
const LOCAL_EVENT = 'appointmentlyy_callbacks_changed';

const EMPTY: CallbackTask[] = [];
let cachedRaw: string | null = null;
let cachedList: CallbackTask[] = EMPTY;

const sameRep = (a?: string, b?: string) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

const newId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

/** All stored callback tasks (every org). Returns a stable reference while unchanged. */
export function getStoredCallbacks(): CallbackTask[] {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedList;
    cachedRaw = raw;
    const parsed = raw ? JSON.parse(raw) : [];
    cachedList = Array.isArray(parsed) ? (parsed as CallbackTask[]) : EMPTY;
    return cachedList;
  } catch (err) {
    console.warn('[CallbackStore] Failed to parse stored callbacks:', err);
    return EMPTY;
  }
}

/** Server snapshot for useSyncExternalStore. */
export function getServerCallbacks(): CallbackTask[] {
  return EMPTY;
}

function saveStoredCallbacks(tasks: CallbackTask[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    window.dispatchEvent(new Event(LOCAL_EVENT));
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.postMessage({ type: 'CALLBACKS_UPDATED' });
      channel.close();
    }
  } catch (err) {
    console.warn('[CallbackStore] Failed to save callbacks:', err);
  }
}

/** Subscribe to changes from this tab, other tabs and other windows. */
export function subscribeToCallbacks(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(LOCAL_EVENT, callback);
  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channel.onmessage = (event) => {
      if (event.data?.type === 'CALLBACKS_UPDATED') callback();
    };
  }
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(LOCAL_EVENT, callback);
    if (channel) channel.close();
  };
}

/** The creator can reassign; so can Supervisor, Manager, Admin and Super Admin (same rule as lead reassignment). */
export function canUserReassignCallback(
  task: CallbackTask,
  actorName: string,
  actorRole?: string | null
): boolean {
  if (task.status !== 'open') return false;
  return sameRep(task.createdBy, actorName) || canUserReassignLeads(actorRole);
}

/** The assignee, the creator and admins can mark a callback done. */
export function canUserCompleteCallback(
  task: CallbackTask,
  actorName: string,
  actorRole?: string | null
): boolean {
  return (
    sameRep(task.assignedTo, actorName) ||
    sameRep(task.createdBy, actorName) ||
    canUserReassignLeads(actorRole)
  );
}

export function createCallbackTask(input: {
  tenantCode: string;
  contactId: string;
  contactName: string;
  companyName: string;
  phone?: string;
  email?: string;
  dueAt: string;
  timeZone: string;
  note?: string;
  createdBy: string;
  assignedTo: string;
  activityId?: string;
}): CallbackTask {
  const nowIso = new Date().toISOString();
  const assignedTo = input.assignedTo.trim() || input.createdBy;
  const task: CallbackTask = {
    id: newId('cb'),
    tenantCode: input.tenantCode,
    contactId: input.contactId,
    contactName: input.contactName,
    companyName: input.companyName,
    phone: input.phone,
    email: input.email,
    dueAt: input.dueAt,
    timeZone: input.timeZone,
    note: (input.note || '').trim(),
    disposition: CALLBACK_DISPOSITION,
    createdBy: input.createdBy,
    assignedTo,
    status: 'open',
    createdAt: nowIso,
    updatedAt: nowIso,
    activityId: input.activityId,
    events: [{ id: newId('cbe'), at: nowIso, actor: input.createdBy, type: 'created', toRep: assignedTo }],
  };
  saveStoredCallbacks([task, ...getStoredCallbacks()]);

  const noteLine = task.note ? `\nNote: ${task.note}` : '';
  recordContactTouch(task.contactId, {
    type: 'status',
    title: 'Callback scheduled',
    summary: `${formatCallbackConfirmation(task)}${noteLine}`,
    repName: task.createdBy,
  });
  return task;
}

/**
 * Reassign an open callback to another rep in the same org.
 * Returns the updated task, or null when the actor is not allowed or nothing changed.
 */
export function reassignCallbackTask(
  taskId: string,
  newRep: string,
  actor: { name: string; role?: string | null; tenantCode: string }
): CallbackTask | null {
  const clean = newRep.trim();
  if (!clean) return null;
  const all = getStoredCallbacks();
  const index = all.findIndex((t) => t.id === taskId);
  if (index === -1) return null;
  const task = all[index];
  if (task.tenantCode !== actor.tenantCode) return null;
  if (!canUserReassignCallback(task, actor.name, actor.role)) {
    console.warn('[CallbackStore] Only the rep who scheduled a callback, or an admin, can reassign it.');
    return null;
  }
  if (sameRep(task.assignedTo, clean)) return null;

  const nowIso = new Date().toISOString();
  const updated: CallbackTask = {
    ...task,
    assignedTo: clean,
    updatedAt: nowIso,
    events: [
      ...task.events,
      { id: newId('cbe'), at: nowIso, actor: actor.name, type: 'reassigned', fromRep: task.assignedTo, toRep: clean },
    ],
  };
  const next = [...all];
  next[index] = updated;
  saveStoredCallbacks(next);

  recordContactTouch(task.contactId, {
    type: 'status',
    title: 'Callback reassigned',
    summary: `Callback for ${formatCallbackDue(task.dueAt)} reassigned from ${task.assignedTo} to ${clean} by ${actor.name}.`,
    repName: actor.name,
  });
  return updated;
}

export function setCallbackTaskDone(
  taskId: string,
  done: boolean,
  actor: { name: string; role?: string | null; tenantCode: string }
): CallbackTask | null {
  const all = getStoredCallbacks();
  const index = all.findIndex((t) => t.id === taskId);
  if (index === -1) return null;
  const task = all[index];
  if (task.tenantCode !== actor.tenantCode) return null;
  if (!canUserCompleteCallback(task, actor.name, actor.role)) return null;
  const nowIso = new Date().toISOString();
  const updated: CallbackTask = {
    ...task,
    status: done ? 'done' : 'open',
    completedAt: done ? nowIso : undefined,
    updatedAt: nowIso,
    events: [...task.events, { id: newId('cbe'), at: nowIso, actor: actor.name, type: done ? 'completed' : 'reopened' }],
  };
  const next = [...all];
  next[index] = updated;
  saveStoredCallbacks(next);
  return updated;
}

/* ---------------------------------------------------------------- formatting */

/** The viewer's IANA time zone, e.g. "Asia/Manila". */
export function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Short zone label for a date in the viewer's zone, e.g. "GMT+8" or "PST". */
export function getTimeZoneAbbr(date: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName');
    return part?.value || '';
  } catch {
    return '';
  }
}

/** "Tue 12 Nov, 10:30 AM" in the viewer's local time zone. */
export function formatCallbackDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${weekday} ${d.getDate()} ${month}, ${time}`;
}

/** "Callback set for Tue 12 Nov, 10:30 AM. Assigned to Maya Santos." */
export function formatCallbackConfirmation(task: Pick<CallbackTask, 'dueAt' | 'assignedTo'>): string {
  return `Callback set for ${formatCallbackDue(task.dueAt)}. Assigned to ${task.assignedTo}.`;
}

export type CallbackDueState = 'overdue' | 'today' | 'upcoming';

export function getCallbackDueState(iso: string, now: Date = new Date()): CallbackDueState {
  const d = new Date(iso);
  if (d.getTime() < now.getTime()) return 'overdue';
  if (d.toDateString() === now.toDateString()) return 'today';
  return 'upcoming';
}
