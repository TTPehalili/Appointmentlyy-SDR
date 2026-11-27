'use client';

/**
 * The browser's view of the workspace Do Not Contact list (GET /api/suppression), shared by every screen in the tab.
 * The server is the source of truth and checks every dial and email itself; this copy only drives the badges and
 * disabled buttons. It is held in memory for the signed-in workspace only (never in localStorage) and is refreshed
 * when the tab regains focus, every minute while a screen uses it, and right after this person adds or removes an
 * entry, so a DNC marked by a teammate in another browser shows up here too.
 */
import { useEffect, useSyncExternalStore } from 'react';
import type { SuppressionListItem, SuppressionReason, SuppressionSource } from '@/lib/suppression';

export type SuppressionStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export interface SuppressionState {
  /** The workspace this list belongs to ('' before anything was loaded). */
  tenantKey: string;
  status: SuppressionStatus;
  entries: SuppressionListItem[];
  canRemove: boolean;
  message: string | null;
}

const EMPTY: SuppressionState = { tenantKey: '', status: 'idle', entries: [], canRemove: false, message: null };
let state: SuppressionState = EMPTY;
let lastFetchAt = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const set = (next: SuppressionState) => {
  state = next;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => state;
const serverSnapshot = () => EMPTY;

const REFRESH_MS = 60_000;
const THROTTLE_MS = 10_000;

/** Load (or reload) the list for this workspace. Throttled unless `force`. */
export function refreshSuppression(tenantKey: string, force = false): Promise<void> {
  if (!tenantKey) return Promise.resolve();
  if (state.tenantKey !== tenantKey) {
    // Another workspace (or person): never show its list, start over.
    set({ ...EMPTY, tenantKey, status: 'loading' });
    lastFetchAt = 0;
  } else if (!force && Date.now() - lastFetchAt < THROTTLE_MS) {
    return inFlight ?? Promise.resolve();
  }
  lastFetchAt = Date.now();
  const run = (async () => {
    try {
      const res = await fetch('/api/suppression', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (state.tenantKey !== tenantKey) return;
      if (res.ok && data.success && Array.isArray(data.entries)) {
        set({ tenantKey, status: 'ready', entries: data.entries, canRemove: data.canRemove === true, message: null });
      } else if (data.code === 'SUPPRESSION_UNAVAILABLE') {
        set({ tenantKey, status: 'unavailable', entries: [], canRemove: false, message: data.error || null });
      } else {
        // Keep what we had; say the list may be out of date.
        set({ ...state, status: state.status === 'ready' ? 'ready' : 'error', message: data.error || 'Could not load the Do Not Contact list.' });
      }
    } catch {
      if (state.tenantKey === tenantKey) set({ ...state, status: state.status === 'ready' ? 'ready' : 'error', message: 'Could not load the Do Not Contact list.' });
    }
  })();
  inFlight = run;
  return run.finally(() => {
    if (inFlight === run) inFlight = null;
  });
}

/** The current workspace's list (empty and 'idle' when `tenantKey` is null, e.g. a practice call). */
export function useSuppression(tenantKey: string | null): SuppressionState {
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    if (!tenantKey) return;
    void refreshSuppression(tenantKey);
    const onFocus = () => void refreshSuppression(tenantKey);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshSuppression(tenantKey);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    const t = setInterval(() => void refreshSuppression(tenantKey, true), REFRESH_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(t);
    };
  }, [tenantKey]);
  if (!tenantKey || s.tenantKey !== tenantKey) return { ...EMPTY, tenantKey: tenantKey || '' };
  return s;
}

type Result = { ok: true; message: string } | { ok: false; message: string; unavailable?: boolean };

/** Put a lead's phone and/or email on the workspace list. Never reports success unless the server saved it. */
export async function addSuppression(
  tenantKey: string,
  input: { phone?: string; email?: string; reason: SuppressionReason; source: SuppressionSource; note?: string },
): Promise<Result> {
  try {
    const res = await fetch('/api/suppression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      const fresh: SuppressionListItem[] = [...(data.added || []), ...(data.already || [])];
      if (state.tenantKey === tenantKey) {
        const ids = new Set(state.entries.map((e) => e.id));
        set({ ...state, status: 'ready', entries: [...fresh.filter((e) => !ids.has(e.id)), ...state.entries] });
      }
      void refreshSuppression(tenantKey, true);
      return { ok: true, message: "Added to your workspace's Do Not Contact list." };
    }
    return { ok: false, message: data.error || `Could not save (${res.status}).`, unavailable: data.code === 'SUPPRESSION_UNAVAILABLE' };
  } catch {
    return { ok: false, message: 'Network error: the Do Not Contact list was not updated.' };
  }
}

/** Admins: take entries off the list with a note saying why. */
export async function removeSuppression(tenantKey: string, ids: string[], note: string): Promise<Result> {
  for (const id of ids) {
    try {
      const res = await fetch('/api/suppression/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        void refreshSuppression(tenantKey, true);
        return { ok: false, message: data.error || `Could not remove (${res.status}).` };
      }
      if (state.tenantKey === tenantKey) set({ ...state, entries: state.entries.filter((e) => e.id !== id) });
    } catch {
      return { ok: false, message: 'Network error: nothing was removed.' };
    }
  }
  void refreshSuppression(tenantKey, true);
  return { ok: true, message: 'Removed from the Do Not Contact list.' };
}
