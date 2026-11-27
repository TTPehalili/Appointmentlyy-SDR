'use client';

/**
 * The browser side of the workspace Do Not Contact list. The server is the source of truth and checks every dial and
 * email itself; the browser never holds other reps' prospects' phone numbers or emails:
 * - useLeadSuppression: is the lead on screen blocked? (POST /api/suppression/check for that lead only, again when the
 *   lead changes or the tab regains focus.) Drives the Dialer's badge and disabled buttons.
 * - guardExternalOpen + openExternal: one server check right before a tel: or mailto: link is opened; fails closed.
 * - useSuppressionBatch: badges for the rows on screen in Contacts (one check for up to 50 rows).
 * - useSuppressionList: the full list, for workspace admins only (Admin › Do Not Contact).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { SuppressionListItem, SuppressionReason, SuppressionSource } from '@/lib/suppression';

// ------------------------------------------------------------------ the check endpoint

export interface CheckHit {
  blocked: true;
  reason: SuppressionReason;
  /** Admins only: */
  id?: string;
  createdByName?: string;
  createdAt?: string;
}
export type CheckChannel = CheckHit | { blocked: false } | null;
export interface CheckResult {
  blocked: boolean;
  phone: CheckChannel;
  email: CheckChannel;
  unreadable?: boolean;
}
export type CheckAnswer =
  | { ok: true; notSetUp: boolean; canRemove: boolean; results: CheckResult[] }
  | { ok: false; message: string };

const CHECK_FAILED = 'The Do Not Contact list could not be checked.';

export async function checkContacts(contacts: { phone?: string; email?: string }[]): Promise<CheckAnswer> {
  try {
    const res = await fetch('/api/suppression/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts: contacts.map((c) => ({ phone: c.phone || undefined, email: c.email || undefined })) }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && Array.isArray(data.results)) {
      return { ok: true, notSetUp: data.notSetUp === true, canRemove: data.canRemove === true, results: data.results };
    }
    return { ok: false, message: data.error || `${CHECK_FAILED} (${res.status})` };
  } catch {
    return { ok: false, message: `${CHECK_FAILED} (network error)` };
  }
}

export const isHit = (c: CheckChannel): c is CheckHit => !!c && c.blocked === true;

/**
 * Right before opening a tel: or mailto: link for a lead: one server check of exactly what will be opened.
 * Fails closed (ok: false with a message) when it is blocked, cannot be read, or the list cannot be checked; before
 * the list is set up on the server it lets the link open, as it always did.
 */
export async function guardExternalOpen(target: { phone?: string; email?: string }): Promise<{ ok: true } | { ok: false; message: string; blocked?: boolean }> {
  const a = await checkContacts([target]);
  if (!a.ok) return { ok: false, message: `${a.message} Nothing was opened. Please try again.` };
  if (a.notSetUp) return { ok: true };
  const r = a.results[0];
  if (!r) return { ok: false, message: `${CHECK_FAILED} Nothing was opened.` };
  if (r.blocked) {
    return { ok: false, blocked: true, message: target.phone ? "This number is on your workspace's Do Not Call list. The call was not started." : "This address is on your workspace's Do Not Contact list. The email was not opened." };
  }
  if (r.unreadable) return { ok: false, message: target.phone ? 'This phone number cannot be read, so it was not dialed.' : 'This email address cannot be read, so it was not opened.' };
  return { ok: true };
}

/** Open a tel: / mailto: link from code (after the check), the same way a click on the link would. */
export function openExternal(href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export interface LeadSuppressionState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
  phone: CheckChannel;
  email: CheckChannel;
  canRemove: boolean;
  message: string | null;
}
const IDLE: LeadSuppressionState = { status: 'idle', phone: null, email: null, canRemove: false, message: null };

/**
 * Is the lead on screen on the list? `enabled` false (practice calls): always idle. Re-checks when the phone or email
 * changes (after a short pause, so typing in the email box is one check), when the tab regains focus (a teammate may
 * have marked the lead), and when refresh() is called (after this person adds or removes an entry).
 */
export function useLeadSuppression(enabled: boolean, phone: string, email: string): LeadSuppressionState & { refresh: () => void } {
  const [state, setState] = useState<LeadSuppressionState>(IDLE);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const lastFocusCheck = useRef(0);
  const has = enabled && !!(phone.trim() || email.trim());
  useEffect(() => {
    if (!has) return;
    let live = true;
    const t = setTimeout(async () => {
      const a = await checkContacts([{ phone, email }]);
      if (!live) return;
      if (!a.ok) {
        setState({ status: 'error', phone: null, email: null, canRemove: false, message: a.message });
      } else {
        const r = a.results[0];
        setState({ status: a.notSetUp ? 'unavailable' : 'ready', phone: r?.phone ?? null, email: r?.email ?? null, canRemove: a.canRemove, message: null });
      }
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [has, phone, email, tick]);
  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => {
      if (Date.now() - lastFocusCheck.current < 10_000) return;
      lastFocusCheck.current = Date.now();
      refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [enabled, refresh]);
  return { ...(has ? state : IDLE), refresh };
}

/** Which of these contacts (the rows on screen, at most 50) are on the list: their indexes. Empty while unknown. */
export function useSuppressionBatch(enabled: boolean, contacts: { phone?: string; email?: string }[]): Set<number> {
  const key = useMemo(() => JSON.stringify(contacts.slice(0, 50).map((c) => [c.phone || '', c.email || ''])), [contacts]);
  const [blocked, setBlocked] = useState<{ key: string; set: Set<number> }>({ key: '', set: new Set() });
  useEffect(() => {
    const list = (JSON.parse(key) as [string, string][]).map(([phone, email]) => ({ phone, email }));
    if (!enabled || !list.some((c) => c.phone || c.email)) return;
    let live = true;
    void checkContacts(list).then((a) => {
      if (!live || !a.ok) return;
      setBlocked({ key, set: new Set(a.results.map((r, i) => (r.blocked ? i : -1)).filter((i) => i >= 0)) });
    });
    return () => {
      live = false;
    };
  }, [enabled, key]);
  return useMemo(() => (blocked.key === key ? blocked.set : new Set<number>()), [blocked, key]);
}

// ------------------------------------------------------------------ add / remove

type Result = { ok: true; message: string } | { ok: false; message: string; unavailable?: boolean };

/**
 * Put a lead's phone and/or email on the workspace list. Never reports success unless the server saved it, and says
 * exactly which channels are now on the list (`saved`, from the entries the server added or already had), so the
 * caller never claims calls are blocked when no phone entry exists.
 */
export async function addSuppression(
  input: { phone?: string; email?: string; reason: SuppressionReason; source: SuppressionSource; note?: string },
): Promise<{ ok: true; saved: { phone: boolean; email: boolean } } | { ok: false; message: string; unavailable?: boolean }> {
  try {
    const res = await fetch('/api/suppression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      listChanged();
      const entries: { kind?: string }[] = [...(Array.isArray(data.added) ? data.added : []), ...(Array.isArray(data.already) ? data.already : [])];
      return { ok: true, saved: { phone: entries.some((e) => e.kind === 'phone'), email: entries.some((e) => e.kind === 'email') } };
    }
    return { ok: false, message: data.error || `Could not save (${res.status}).`, unavailable: data.code === 'SUPPRESSION_UNAVAILABLE' };
  } catch {
    return { ok: false, message: 'Network error: the Do Not Contact list was not updated.' };
  }
}

/** Admins: take entries off the list with a note saying why. */
export async function removeSuppression(ids: string[], note: string): Promise<Result> {
  for (const id of ids) {
    try {
      const res = await fetch('/api/suppression/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        listChanged();
        return { ok: false, message: data.error || `Could not remove (${res.status}).` };
      }
    } catch {
      return { ok: false, message: 'Network error: nothing was removed.' };
    }
  }
  listChanged();
  return { ok: true, message: 'Removed from the Do Not Contact list.' };
}

/** Admins: take off every active entry a teammate added between two times, with a note (kept on each entry). */
export async function undoSuppressionsBy(input: { addedBy: string; from: string; to: string; note: string }): Promise<{ ok: true; removed: number } | { ok: false; message: string }> {
  try {
    const res = await fetch('/api/suppression/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    listChanged();
    if (res.ok && data.success) return { ok: true, removed: Number(data.removed) || 0 };
    return { ok: false, message: data.error || `Could not undo (${res.status}).` };
  } catch {
    return { ok: false, message: 'Network error: nothing was removed.' };
  }
}

// ------------------------------------------------------------------ the full list (admins only)

export type AdminListItem = SuppressionListItem & { createdByEmail: string };
export interface SuppressionListState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'forbidden' | 'error';
  entries: AdminListItem[];
  message: string | null;
}
const LIST_EMPTY: SuppressionListState = { status: 'idle', entries: [], message: null };
const SERVER_LIST = { key: '', s: LIST_EMPTY };
let listState: { key: string; s: SuppressionListState } = SERVER_LIST;
const listeners = new Set<() => void>();
const emit = (key: string, s: SuppressionListState) => {
  listState = { key, s };
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
let reloadList: (() => void) | null = null;
function listChanged() {
  reloadList?.();
}

/** Workspace admins: the full list (GET /api/suppression). `key` = workspace + person, so another's list never shows. */
export function useSuppressionList(key: string | null): SuppressionListState & { reload: () => void } {
  const snap = useSyncExternalStore(subscribe, () => listState, () => SERVER_LIST);
  const load = useCallback(async () => {
    if (!key) return;
    if (listState.key !== key) emit(key, { ...LIST_EMPTY, status: 'loading' });
    try {
      const res = await fetch('/api/suppression', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (listState.key !== key) return;
      if (res.ok && data.success && Array.isArray(data.entries)) emit(key, { status: 'ready', entries: data.entries, message: null });
      else if (res.status === 403) emit(key, { status: 'forbidden', entries: [], message: data.error || null });
      else if (data.code === 'SUPPRESSION_UNAVAILABLE') emit(key, { status: 'unavailable', entries: [], message: data.error || null });
      else emit(key, { status: 'error', entries: listState.s.entries, message: data.error || 'Could not load the Do Not Contact list.' });
    } catch {
      if (listState.key === key) emit(key, { status: 'error', entries: listState.s.entries, message: 'Could not load the Do Not Contact list.' });
    }
  }, [key]);
  useEffect(() => {
    if (!key) return;
    void load();
    const mine = () => void load();
    reloadList = mine;
    return () => {
      if (reloadList === mine) reloadList = null;
    };
  }, [key, load]);
  const s = key && snap.key === key ? snap.s : LIST_EMPTY;
  return { ...s, reload: () => void load() };
}
