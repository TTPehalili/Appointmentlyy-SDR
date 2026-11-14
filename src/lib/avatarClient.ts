'use client';

/**
 * Browser cache of profile photos for the signed-in person's current workspace: one load of
 * GET /api/profile/avatar, then kept fresh by whatever else already carries photos (the chat
 * directory, the Members list) and by the chat stream's `member` event when someone changes theirs.
 * Starts over when the person or workspace changes.
 */
import * as React from 'react';
import { useServerAuth } from '@/lib/authClient';

type Avatars = Record<string, string | null>;

interface AvatarState {
  key: string | null;
  avatars: Avatars;
  canManage: boolean;
}

let state: AvatarState = { key: null, avatars: {}, canManage: false };
const EMPTY: AvatarState = state;
let loading: Promise<void> | null = null;
let loadedKey: string | null = null;
const listeners = new Set<() => void>();

function setState(patch: Partial<AvatarState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

async function load(key: string) {
  try {
    const res = await fetch('/api/profile/avatar', { cache: 'no-store' });
    const data = (await res.json().catch(() => null)) as { success?: boolean; avatars?: Avatars; canManage?: boolean } | null;
    if (state.key !== key || !res.ok || !data?.success) return;
    // Anything learned meanwhile (a live update) wins over the older full load.
    setState({ avatars: { ...(data.avatars ?? {}), ...state.avatars }, canManage: Boolean(data.canManage) });
  } catch {
    // Offline: initials until the next load.
  }
}

/** Switch the cache to this person + workspace and load it once. */
function ensure(key: string | null) {
  if (!key) return;
  if (state.key !== key) {
    loading = null;
    loadedKey = null;
    setState({ key, avatars: {}, canManage: false });
  }
  if (loadedKey === key || loading) return;
  loadedKey = key;
  loading = load(key).finally(() => {
    loading = null;
  });
}

/** Reload everyone's photos (after a long gap or an error). */
export function refreshAvatars() {
  if (!state.key) return;
  loadedKey = null;
  ensure(state.key);
}

/** Record photos that came with another payload (chat directory, member list). `undefined` = unknown, skipped. */
export function primeAvatars(people: { email: string; avatar?: string | null }[]) {
  let changed = false;
  const next = { ...state.avatars };
  for (const p of people) {
    if (p.avatar === undefined) continue;
    const email = p.email.toLowerCase();
    if (next[email] !== p.avatar) {
      next[email] = p.avatar;
      changed = true;
    }
  }
  if (changed) setState({ avatars: next });
}

/** One person's photo changed (live event or our own save). */
export function setAvatarLocal(email: string, avatar: string | null) {
  primeAvatars([{ email, avatar }]);
}

function useKey(): string | null {
  const { identity } = useServerAuth();
  return identity ? `${identity.email.toLowerCase()}|${identity.tenantCode}` : null;
}

function useAvatarState(): AvatarState {
  const key = useKey();
  React.useEffect(() => ensure(key), [key]);
  const s = React.useSyncExternalStore(subscribe, () => state, () => EMPTY);
  return s.key === key ? s : EMPTY;
}

/** The photo to show for someone in this workspace: a src, null for initials, undefined while unknown. */
export function useAvatarSrc(email: string | null | undefined): string | null | undefined {
  const s = useAvatarState();
  return email ? s.avatars[email.toLowerCase()] : undefined;
}

/** The signed-in person's own photo, and whether they may change other people's. */
export function useMyAvatar(): { email: string | null; src: string | null | undefined; canManage: boolean } {
  const { identity } = useServerAuth();
  const s = useAvatarState();
  const email = identity?.email.toLowerCase() ?? null;
  return { email, src: email ? s.avatars[email] : undefined, canManage: s.canManage };
}

type SaveResult = { ok: true; avatar: string | null } | { ok: false; error: string; status: number };

async function send(method: 'PUT' | 'DELETE', body: Record<string, unknown>): Promise<SaveResult> {
  try {
    const res = await fetch('/api/profile/avatar', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string; email?: string; avatar?: string | null } | null;
    if (!res.ok || !data?.success) return { ok: false, status: res.status, error: data?.error || `Could not save the photo (${res.status}).` };
    const avatar = data.avatar ?? null;
    if (data.email) setAvatarLocal(data.email, avatar);
    return { ok: true, avatar };
  } catch {
    return { ok: false, status: 0, error: 'Could not reach the server. Check your connection.' };
  }
}

/** Save a photo: `preset:avatar-01` or an upload data URL. Without `email`, your own. */
export const saveAvatar = (avatar: string, email?: string) => send('PUT', { avatar, ...(email ? { email } : {}) });

/** Remove a photo (initials show). Without `email`, your own. */
export const removeAvatar = (email?: string) => send('DELETE', email ? { email } : {});
