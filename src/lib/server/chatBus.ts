/**
 * In-process pub/sub for team chat, keyed by workspace. The database stays the source of truth:
 * the bus only pushes changes to open live streams (GET /api/chat/stream) on this server, and the
 * browser catches up with ?since= after any gap. Railway runs one instance, so this reaches
 * everyone; with more instances, clients would still converge through the 5 s polling fallback.
 *
 * Kept on globalThis so every route handler bundle publishes to the same listeners.
 */
import { canSeeChannel, type ChatEvent } from '@/lib/chat';

export interface ChatListener {
  email: string;
  canManage: boolean;
  send: (event: ChatEvent) => void;
}

const g = globalThis as typeof globalThis & { __appyChatBus?: Map<string, Set<ChatListener>> };
const bus = (g.__appyChatBus ??= new Map<string, Set<ChatListener>>());

/** Start receiving a workspace's events. Returns the unsubscribe function. */
export function subscribeChat(tenantCode: string, listener: ChatListener): () => void {
  let set = bus.get(tenantCode);
  if (!set) bus.set(tenantCode, (set = new Set()));
  set.add(listener);
  return () => {
    const cur = bus.get(tenantCode);
    if (!cur) return;
    cur.delete(listener);
    if (cur.size === 0) bus.delete(tenantCode);
  };
}

/** Deliver an event to everyone in the workspace who may see it (#managers and DMs are filtered here). */
export function publishChat(tenantCode: string, event: ChatEvent) {
  const set = bus.get(tenantCode);
  if (!set) return;
  for (const l of [...set]) {
    if (event.type !== 'presence' && !canSeeChannel(event.channel, l)) continue;
    try {
      l.send(event);
    } catch {
      // A closed stream: its own cleanup removes it.
    }
  }
}

/** Open streams (for diagnostics). */
export function chatListenerCount(tenantCode?: string): number {
  if (tenantCode) return bus.get(tenantCode)?.size ?? 0;
  let n = 0;
  for (const s of bus.values()) n += s.size;
  return n;
}
