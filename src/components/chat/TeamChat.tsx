'use client';

import * as React from 'react';
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  Hash,
  LifeBuoy,
  Lock,
  MessageSquarePlus,
  MessagesSquare,
  Pin,
  PinOff,
  SendHorizontal,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Avatar, Button, ConfirmDialog, EmptyState, IconButton, InlineError, SearchInput, Skeleton, useToast } from '@/components/ui';
import {
  CHAT_BODY_MAX,
  MANAGER_ROLES,
  PRESENCE_LABEL,
  tokenizeBody,
  type ChatChannelSummary,
  type ChatMember,
  type ChatMessage,
  type ChatPresence,
  type ChatPresenceStatus,
} from '@/lib/chat';
import {
  claimHelp,
  deleteMessage,
  enableDesktopNotifications,
  loadOlder,
  openChannelMessages,
  openDm,
  pinMessage,
  presenceOf,
  requestFloorHelp,
  retryChat,
  sendMessage,
  setManualAway,
  setSoundOn,
  useChatState,
  useChatViewing,
  type ChatState,
} from '@/lib/chatClient';

// ------------------------------------------------------------------ small helpers

const PRESENCE_DOT: Record<ChatPresenceStatus, string> = {
  available: 'bg-success-500',
  on_call: 'bg-danger-fg',
  away: 'bg-fg-disabled',
};

function PresenceDot({ status, className }: { status: ChatPresenceStatus; className?: string }) {
  return (
    <span
      className={cn('inline-block size-2.5 shrink-0 rounded-full ring-2 ring-surface', PRESENCE_DOT[status], className)}
      aria-label={PRESENCE_LABEL[status]}
      title={PRESENCE_LABEL[status]}
      role="img"
    />
  );
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function channelTitle(c: ChatChannelSummary) {
  return c.kind === 'dm' ? c.dmWith?.name ?? 'Direct message' : `#${c.name}`;
}

function channelSubtitle(c: ChatChannelSummary, people: ChatPresence[]) {
  if (c.kind === 'floor') return 'Everyone in this workspace';
  if (c.kind === 'managers') return 'Supervisors, managers and admins only';
  const p = people.find((x) => x.email === c.dmWith?.email);
  return [c.dmWith?.role, PRESENCE_LABEL[presenceOf(p)]].filter(Boolean).join(' · ');
}

function preview(m: ChatMessage | null) {
  if (!m) return 'No messages yet';
  if (m.deletedAt) return 'Message deleted';
  if (m.kind === 'win' || m.kind === 'system' || m.kind === 'help') return m.body;
  return `${m.senderName.split(' ')[0]}: ${m.body}`;
}

function UnreadBadge({ count, mention, selected }: { count: number; mention: boolean; selected?: boolean }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-caption font-medium tabular-nums',
        selected ? 'bg-selected-fg text-selected' : mention ? 'bg-selected text-selected-fg' : 'bg-subtle text-fg-secondary',
      )}
      aria-label={`${count} unread${mention ? ', you were mentioned' : ''}`}
    >
      {mention && '@'}
      {count >= 100 ? '99+' : count}
    </span>
  );
}

/** Message text: escaped by React, http(s) links clickable, @mentions highlighted. */
function MessageBody({ body, mentionNames }: { body: string; mentionNames: { name: string; me: boolean }[] }) {
  const tokens = React.useMemo(() => tokenizeBody(body, mentionNames), [body, mentionNames]);
  return (
    <p className="whitespace-pre-wrap break-words text-body text-fg">
      {tokens.map((t, i) =>
        t.type === 'link' ? (
          <a key={i} href={t.href} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-text underline underline-offset-2 hover:no-underline">
            {t.text}
          </a>
        ) : t.type === 'mention' ? (
          <span key={i} className={cn('rounded-sm px-0.5 font-medium', t.me ? 'bg-selected-soft text-selected-soft-fg' : 'text-selected-soft-fg')}>
            {t.text}
          </span>
        ) : (
          <React.Fragment key={i}>{t.text}</React.Fragment>
        ),
      )}
    </p>
  );
}

function useMediaQuery(query: string) {
  return React.useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// ------------------------------------------------------------------ main component

/**
 * Team chat UI shared by the top-bar drawer and the /chat page. `page` shows the channel list and
 * the conversation side by side from 768px; the drawer (and the page on phones) shows one at a
 * time with a back button.
 */
export function TeamChat({ variant, onClose, open = true }: { variant: 'page' | 'drawer'; onClose?: () => void; open?: boolean }) {
  const s = useChatState();
  const wide = useMediaQuery('(min-width: 768px)');
  const split = variant === 'page' && wide;
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [view, setView] = React.useState<'list' | 'conversation' | 'people'>('list');

  const floor = s.channels.find((c) => c.kind === 'floor');
  // Side by side, #floor is open by default.
  const shownId = activeId ?? (split ? floor?.id ?? null : null);
  const conversationVisible = open && !!shownId && (split || view === 'conversation');
  const active = s.channels.find((c) => c.id === shownId) ?? null;

  useChatViewing(conversationVisible ? shownId : null);
  React.useEffect(() => {
    if (conversationVisible && shownId) void openChannelMessages(shownId);
  }, [conversationVisible, shownId]);

  const pick = (id: string) => {
    setActiveId(id);
    setView('conversation');
  };

  if (s.status === 'idle' || s.status === 'loading') {
    return (
      <Shell variant={variant} onClose={onClose} title="Team chat">
        <div className="flex flex-col gap-3 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Shell>
    );
  }
  if (s.status === 'signed-out' || s.status === 'unavailable') {
    return (
      <Shell variant={variant} onClose={onClose} title="Team chat">
        <EmptyState
          icon={<Lock />}
          title={s.status === 'signed-out' ? 'Sign in to use team chat' : 'Team chat is private'}
          description={s.error ?? undefined}
        />
      </Shell>
    );
  }
  if (s.status === 'error') {
    return (
      <Shell variant={variant} onClose={onClose} title="Team chat">
        <div className="p-4">
          <InlineError message={s.error ?? 'Could not load team chat.'} onRetry={retryChat} />
        </div>
      </Shell>
    );
  }

  const listPane = (
    <ChannelList
      state={s}
      activeId={split ? shownId : null}
      onPick={pick}
      onNew={() => setView('people')}
      onClose={variant === 'drawer' ? onClose : undefined}
    />
  );
  const peoplePane = (
    <PeoplePicker
      state={s}
      onBack={() => setView('list')}
      onPicked={(id) => pick(id)}
    />
  );
  const conversation = active ? (
    <Conversation
      key={active.id}
      state={s}
      channel={active}
      onBack={split ? undefined : () => setView('list')}
      onClose={variant === 'drawer' ? onClose : undefined}
    />
  ) : (
    <EmptyState icon={<MessagesSquare />} title="Pick a conversation" description="Choose a channel or start a direct message." />
  );

  if (split) {
    return (
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
        <div className="flex w-72 shrink-0 flex-col border-r border-line">{view === 'people' ? peoplePane : listPane}</div>
        <div className="flex min-w-0 flex-1 flex-col">{conversation}</div>
      </div>
    );
  }
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden bg-surface', variant === 'page' && 'rounded-lg border border-line shadow-xs')}>
      {view === 'people' ? peoplePane : view === 'conversation' && active ? conversation : listPane}
    </div>
  );
}

function Shell({ variant, onClose, title, children }: { variant: 'page' | 'drawer'; onClose?: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col bg-surface', variant === 'page' && 'rounded-lg border border-line shadow-xs')}>
      <PaneHeader title={title} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function PaneHeader({
  title,
  subtitle,
  onBack,
  onClose,
  actions,
  leading,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onBack?: () => void;
  onClose?: () => void;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
      {onBack && (
        <IconButton label="Back to conversations" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </IconButton>
      )}
      {leading}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-h3 text-fg">{title}</h2>
        {subtitle && <p className="truncate text-caption text-fg-tertiary">{subtitle}</p>}
      </div>
      {actions}
      {onClose && (
        <IconButton label="Close chat" size="sm" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ channel list

function ChannelList({
  state: s,
  activeId,
  onPick,
  onNew,
  onClose,
}: {
  state: ChatState;
  activeId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onClose?: () => void;
}) {
  const shared = s.channels.filter((c) => c.kind !== 'dm');
  const dms = s.channels
    .filter((c) => c.kind === 'dm')
    .sort((a, b) => (b.lastMessage?.createdAt ?? '').localeCompare(a.lastMessage?.createdAt ?? ''));
  const counts = s.people.reduce(
    (acc, p) => {
      acc[presenceOf(p)] += 1;
      return acc;
    },
    { available: 0, on_call: 0, away: 0 } as Record<ChatPresenceStatus, number>,
  );

  const row = (c: ChatChannelSummary) => {
    const selected = c.id === activeId;
    const person = c.kind === 'dm' ? s.people.find((p) => p.email === c.dmWith?.email) : undefined;
    return (
      <li key={c.id}>
        <button
          type="button"
          onClick={() => onPick(c.id)}
          aria-current={selected ? 'true' : undefined}
          className={cn(
            'focus-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-150',
            selected ? 'bg-selected text-selected-fg' : c.mentions ? 'bg-selected-soft text-selected-soft-fg hover:bg-selected-soft' : 'text-fg hover:bg-subtle',
          )}
        >
          {c.kind === 'dm' ? (
            <span className="relative">
              <Avatar name={c.dmWith?.name ?? '?'} size="sm" />
              <PresenceDot status={presenceOf(person)} className="absolute -bottom-0.5 -right-0.5 size-2" />
            </span>
          ) : (
            <span className={cn('inline-flex size-6 items-center justify-center', selected ? 'text-selected-fg' : 'text-fg-tertiary')} aria-hidden>
              {c.kind === 'managers' ? <Lock className="size-4" /> : <Hash className="size-4" />}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate text-body', c.unread ? 'font-semibold' : 'font-medium')}>{c.kind === 'dm' ? c.dmWith?.name ?? 'Direct message' : c.name}</span>
            <span className={cn('block truncate text-caption', selected ? 'text-selected-fg/80' : 'text-fg-tertiary')}>{preview(c.lastMessage)}</span>
          </span>
          <UnreadBadge count={c.unread} mention={c.mentions > 0} selected={selected} />
        </button>
      </li>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        title="Team chat"
        subtitle={`${counts.available} available · ${counts.on_call} on a call · ${counts.away} away`}
        onClose={onClose}
        actions={
          <IconButton label="New direct message" size="sm" onClick={onNew}>
            <MessageSquarePlus className="size-4" />
          </IconButton>
        }
      />
      <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto p-2">
        <p className="px-2.5 pb-1 pt-1 text-group text-fg-tertiary">Channels</p>
        <ul className="flex flex-col gap-px">{shared.map(row)}</ul>
        <div className="flex items-center justify-between px-2.5 pb-1 pt-4">
          <p className="text-group text-fg-tertiary">Direct messages</p>
        </div>
        {dms.length ? (
          <ul className="flex flex-col gap-px">{dms.map(row)}</ul>
        ) : (
          <div className="px-2.5 py-2">
            <p className="text-small text-fg-secondary">No direct messages yet.</p>
            <Button size="sm" variant="secondary" className="mt-2" icon={<MessageSquarePlus />} onClick={onNew}>
              Message a teammate
            </Button>
          </div>
        )}
      </nav>
      <ChatFooter state={s} />
    </div>
  );
}

function ChatFooter({ state: s }: { state: ChatState }) {
  const toast = useToast();
  const status = s.myStatus;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-small text-fg-secondary">
        <PresenceDot status={status} />
        {PRESENCE_LABEL[status]}
      </span>
      {status !== 'on_call' && (
        <button type="button" onClick={() => setManualAway(!s.manualAway)} className="focus-ring rounded-sm text-small text-fg-tertiary underline underline-offset-2 hover:text-fg">
          {s.manualAway ? 'Set available' : 'Set away'}
        </button>
      )}
      <span className="ml-auto flex items-center gap-0.5">
        <span className={cn('mr-1 text-caption', s.transport === 'live' ? 'text-success-fg' : 'text-fg-tertiary')} title={s.transport === 'live' ? 'Messages arrive instantly' : 'Checking for messages every 5 seconds'}>
          {s.transport === 'live' ? 'Live' : s.transport === 'polling' ? 'Reconnecting' : 'Connecting'}
        </span>
        <IconButton label={s.soundOn ? 'Mute chat sounds' : 'Turn chat sounds on'} size="sm" onClick={() => setSoundOn(!s.soundOn)}>
          {s.soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </IconButton>
        {typeof Notification !== 'undefined' && (
          <IconButton
            label={s.notificationsAllowed ? 'Desktop alerts are on' : 'Turn on desktop alerts'}
            size="sm"
            onClick={async () => {
              const ok = await enableDesktopNotifications();
              toast({ message: ok ? 'Desktop alerts on for DMs, mentions and help requests (not during calls).' : 'Desktop alerts are blocked in this browser.' });
            }}
          >
            {s.notificationsAllowed ? <Bell className="size-4" /> : <BellOff className="size-4" />}
          </IconButton>
        )}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ people picker (new DM)

function PeoplePicker({ state: s, onBack, onPicked }: { state: ChatState; onBack: () => void; onPicked: (channelId: string) => void }) {
  const [q, setQ] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const people = s.people
    .filter((p) => p.email !== s.me?.email)
    .filter((p) => !q.trim() || `${p.name} ${p.email} ${p.role}`.toLowerCase().includes(q.trim().toLowerCase()));
  const order: Record<ChatPresenceStatus, number> = { available: 0, on_call: 1, away: 2 };
  people.sort((a, b) => order[presenceOf(a)] - order[presenceOf(b)] || a.name.localeCompare(b.name));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title="New direct message" subtitle="People in this workspace" onBack={onBack} />
      <div className="border-b border-line p-3">
        <SearchInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" />
        {error && <p className="mt-2 text-small text-danger-fg">{error}</p>}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {people.length === 0 && (
          <EmptyState icon={<MessagesSquare />} title={q ? 'No one matches' : 'No teammates yet'} description={q ? undefined : 'Invite people to this workspace to chat with them.'} className="py-10" />
        )}
        {people.map((p) => (
          <li key={p.email}>
            <button
              type="button"
              disabled={!!busy}
              onClick={async () => {
                setBusy(p.email);
                setError(null);
                const r = await openDm(p.email);
                setBusy(null);
                if (r.ok) onPicked(r.channelId);
                else setError(r.error);
              }}
              className="focus-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-subtle disabled:opacity-60"
            >
              <span className="relative">
                <Avatar name={p.name} size="sm" />
                <PresenceDot status={presenceOf(p)} className="absolute -bottom-0.5 -right-0.5 size-2" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium text-fg">{p.name}</span>
                <span className="block truncate text-caption text-fg-tertiary">
                  {p.role} · {PRESENCE_LABEL[presenceOf(p)]}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ conversation

function Conversation({ state: s, channel, onBack, onClose }: { state: ChatState; channel: ChatChannelSummary; onBack?: () => void; onClose?: () => void }) {
  const toast = useToast();
  const me = s.me!;
  const data = s.messages[channel.id];
  const items = React.useMemo(() => data?.items ?? [], [data?.items]);
  const scroller = React.useRef<HTMLDivElement>(null);
  const nearBottom = React.useRef(true);
  const firstId = items[0]?.id;
  const lastId = items[items.length - 1]?.id;
  const prevHeight = React.useRef<{ firstId?: string; height: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<ChatMessage | null>(null);
  const person = channel.kind === 'dm' ? s.people.find((p) => p.email === channel.dmWith?.email) : undefined;

  const audience: ChatMember[] = React.useMemo(() => {
    if (channel.kind === 'floor') return s.people;
    if (channel.kind === 'managers') return s.people.filter((p) => MANAGER_ROLES.includes(p.role));
    return s.people.filter((p) => p.email === channel.dmWith?.email || p.email === me.email);
  }, [channel.kind, channel.dmWith?.email, s.people, me.email]);
  const mentionNames = React.useMemo(() => s.people.map((p) => ({ name: p.name, me: p.email === me.email })), [s.people, me.email]);

  // Keep the view pinned to the newest message unless the reader scrolled up; keep position when older ones load.
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const prev = prevHeight.current;
    if (prev && prev.firstId && prev.firstId !== firstId && el.scrollHeight > prev.height) {
      el.scrollTop += el.scrollHeight - prev.height;
    } else if (nearBottom.current || items[items.length - 1]?.senderEmail === me.email) {
      el.scrollTop = el.scrollHeight;
    }
    prevHeight.current = { firstId, height: el.scrollHeight };
  }, [firstId, lastId, items, me.email]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    prevHeight.current = { firstId, height: el.scrollHeight };
  };

  const canDelete = (m: ChatMessage) => !m.deletedAt && (m.senderEmail === me.email || me.canManage);
  const canPin = (m: ChatMessage) => channel.kind === 'floor' && me.canManage && m.kind === 'text' && !m.deletedAt;

  const pin = async (id: string | null) => {
    const r = await pinMessage(id);
    toast({ message: r.ok ? (id ? 'Pinned to the top of #floor.' : 'Announcement unpinned.') : r.error });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        title={channelTitle(channel)}
        subtitle={channelSubtitle(channel, s.people)}
        onBack={onBack}
        onClose={onClose}
        leading={
          channel.kind === 'dm' ? (
            <span className="relative">
              <Avatar name={channel.dmWith?.name ?? '?'} size="sm" />
              <PresenceDot status={presenceOf(person)} className="absolute -bottom-0.5 -right-0.5 size-2" />
            </span>
          ) : null
        }
      />

      {channel.kind === 'floor' && channel.pinned && (
        <div className="flex shrink-0 items-start gap-2 border-b border-line bg-selected-soft px-4 py-2.5 text-selected-soft-fg">
          <Pin className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-caption font-medium">
              Pinned announcement · {channel.pinned.senderName}, {dayLabel(channel.pinned.createdAt)} {timeOf(channel.pinned.createdAt)}
            </p>
            <div className="line-clamp-3 [&_p]:text-selected-soft-fg">
              <MessageBody body={channel.pinned.body} mentionNames={mentionNames} />
            </div>
          </div>
          {me.canManage && (
            <IconButton label="Unpin announcement" size="sm" onClick={() => pin(null)} className="text-selected-soft-fg hover:bg-transparent">
              <PinOff className="size-4" />
            </IconButton>
          )}
        </div>
      )}

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-3" role="log" aria-live="polite" aria-label={`Messages in ${channelTitle(channel)}`}>
        {data?.error && <InlineError message={data.error} className="mx-2 mb-3" />}
        {!data?.loaded && data?.loading && (
          <div className="flex flex-col gap-3 px-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
        {data?.loaded && data.hasMore && (
          <div className="flex justify-center pb-3">
            <Button size="sm" variant="ghost" loading={data.loading} onClick={() => loadOlder(channel.id)}>
              Load older messages
            </Button>
          </div>
        )}
        {data?.loaded && items.length === 0 && (
          <EmptyState
            icon={channel.kind === 'dm' ? <MessagesSquare /> : <Hash />}
            title="No messages yet"
            description={
              channel.kind === 'floor'
                ? 'Say hello to the floor. Wins and announcements show up here too.'
                : channel.kind === 'managers'
                  ? 'Help requests from reps land here.'
                  : `Start the conversation with ${channel.dmWith?.name ?? 'your teammate'}.`
            }
            className="py-10"
          />
        )}
        {items.map((m, i) => {
          const prev = items[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const grouped =
            !newDay && prev && prev.kind === 'text' && m.kind === 'text' && !prev.deletedAt && prev.senderEmail === m.senderEmail && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < 5 * 60_000;
          return (
            <React.Fragment key={m.id}>
              {newDay && (
                <div className="my-2 flex items-center gap-3 px-2" role="separator">
                  <span className="h-px flex-1 bg-line" />
                  <span className="text-caption text-fg-tertiary">{dayLabel(m.createdAt)}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              <MessageRow
                message={m}
                grouped={!!grouped}
                meEmail={me.email}
                canManage={me.canManage}
                mentionNames={mentionNames}
                pinned={channel.pinned?.id === m.id}
                onDelete={canDelete(m) ? () => setConfirmDelete(m) : undefined}
                onPin={canPin(m) ? () => pin(m.id) : undefined}
                onClaim={async () => {
                  const r = await claimHelp(m.id);
                  toast({ message: r.ok ? `You're on it. ${m.meta.help?.requestedByName ?? 'The rep'} got a message.` : r.error });
                }}
              />
            </React.Fragment>
          );
        })}
      </div>

      <Composer channel={channel} audience={audience} meEmail={me.email} canManage={me.canManage} />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this message?"
        description={confirmDelete && confirmDelete.senderEmail !== me.email ? `This removes ${confirmDelete.senderName}'s message for everyone.` : 'It is removed for everyone.'}
        confirmLabel="Delete"
        icon={<Trash2 />}
        onConfirm={async () => {
          if (!confirmDelete) return;
          const r = await deleteMessage(confirmDelete.id);
          if (!r.ok) toast({ message: r.error });
        }}
      />
    </div>
  );
}

function MessageRow({
  message: m,
  grouped,
  meEmail,
  canManage,
  mentionNames,
  pinned,
  onDelete,
  onPin,
  onClaim,
}: {
  message: ChatMessage;
  grouped: boolean;
  meEmail: string;
  canManage: boolean;
  mentionNames: { name: string; me: boolean }[];
  pinned: boolean;
  onDelete?: () => void;
  onPin?: () => void;
  onClaim: () => void;
}) {
  const time = timeOf(m.createdAt);
  const actions = (onDelete || onPin) && (
    <span className="absolute right-1 top-1 flex gap-0.5 rounded-md border border-line bg-surface opacity-0 shadow-xs transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
      {onPin && !pinned && (
        <IconButton label="Pin to #floor" size="sm" onClick={onPin} className="size-7">
          <Pin className="size-3.5" />
        </IconButton>
      )}
      {onDelete && (
        <IconButton label="Delete message" size="sm" onClick={onDelete} className="size-7 hover:text-danger-fg">
          <Trash2 className="size-3.5" />
        </IconButton>
      )}
    </span>
  );

  if (m.deletedAt) {
    return (
      <div className={cn('px-2 py-1', grouped ? 'pl-12' : '')}>
        <p className="text-small italic text-fg-tertiary">Message deleted · {time}</p>
      </div>
    );
  }

  if (m.kind === 'system') {
    return (
      <div className="flex justify-center px-2 py-1.5">
        <p className="inline-flex items-center gap-1.5 text-caption text-fg-tertiary">
          <Check className="size-3.5" aria-hidden />
          {m.body} · {time}
        </p>
      </div>
    );
  }

  if (m.kind === 'win') {
    return (
      <div className="group relative flex justify-center px-2 py-1.5">
        <p className="inline-flex max-w-full items-center gap-2 rounded-full bg-success-bg px-3.5 py-1.5 text-body font-medium text-success-fg">
          <span className="min-w-0 break-words">{m.body}</span>
          <span className="shrink-0 text-caption font-normal opacity-80">{time}</span>
        </p>
        {onDelete && actions}
      </div>
    );
  }

  if (m.kind === 'help') {
    const h = m.meta.help;
    return (
      <div className="group relative px-1 py-1.5">
        <div className="rounded-lg border border-warning-fg/25 bg-warning-bg px-3.5 py-3 text-warning-fg">
          <div className="flex items-start gap-2.5">
            <LifeBuoy className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-body-strong">
                {h?.requestedByName ?? m.senderName} needs help on a call
                <span className="ml-2 text-caption font-normal opacity-80">{time}</span>
              </p>
              {(h?.leadName || h?.company) && (
                <p className="mt-0.5 text-small">
                  Lead: {[h?.leadName, h?.company].filter(Boolean).join(' · ')}
                </p>
              )}
              {h?.note && <p className="mt-0.5 whitespace-pre-wrap break-words text-small">{h.note}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {h?.claimedBy ? (
                  <span className="inline-flex items-center gap-1.5 text-small font-medium">
                    <Check className="size-4" aria-hidden />
                    {h.claimedBy.email === meEmail ? "You're on it" : `${h.claimedBy.name} is on it`}
                  </span>
                ) : canManage ? (
                  <Button size="sm" variant="primary" onClick={onClaim}>
                    I&apos;m on it
                  </Button>
                ) : (
                  <span className="text-small">Waiting for a supervisor</span>
                )}
              </div>
            </div>
          </div>
        </div>
        {onDelete && actions}
      </div>
    );
  }

  const mentioned = (m.meta.mentions ?? []).includes(meEmail);
  return (
    <div className={cn('group relative flex gap-2.5 rounded-md px-2', grouped ? 'py-0.5' : 'pt-2 pb-0.5', mentioned ? 'bg-selected-soft' : 'hover:bg-subtle/60')}>
      <div className="w-8 shrink-0">{!grouped && <Avatar name={m.senderName} size="md" />}</div>
      <div className="min-w-0 flex-1 pr-14">
        {!grouped && (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-body-strong text-fg">{m.senderName}</span>
            <span className="text-caption text-fg-tertiary">{m.senderRole}</span>
            <time dateTime={m.createdAt} className="text-caption text-fg-tertiary">
              {time}
            </time>
            {pinned && (
              <span className="inline-flex items-center gap-1 text-caption text-selected-soft-fg">
                <Pin className="size-3" aria-hidden /> Pinned
              </span>
            )}
          </p>
        )}
        <MessageBody body={m.body} mentionNames={mentionNames} />
      </div>
      {actions}
    </div>
  );
}

// ------------------------------------------------------------------ composer

function Composer({ channel, audience, meEmail, canManage }: { channel: ChatChannelSummary; audience: ChatMember[]; meEmail: string; canManage: boolean }) {
  const toast = useToast();
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [suggest, setSuggest] = React.useState<{ query: string; start: number; index: number } | null>(null);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const tooLong = text.length > CHAT_BODY_MAX;

  const matches = React.useMemo(() => {
    if (!suggest) return [];
    const q = suggest.query.toLowerCase();
    return audience
      .filter((p) => p.email !== meEmail)
      .filter((p) => !q || p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || p.email.toLowerCase().startsWith(q))
      .slice(0, 6);
  }, [suggest, audience, meEmail]);

  // Grow with the text, up to about six lines.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const updateSuggest = (value: string, caret: number) => {
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(value.slice(0, caret));
    setSuggest(m ? { query: m[2], start: caret - m[2].length - 1, index: 0 } : null);
  };

  const insertMention = (p: ChatMember) => {
    if (!suggest || !ref.current) return;
    const caret = ref.current.selectionStart ?? text.length;
    const next = `${text.slice(0, suggest.start)}@${p.name} ${text.slice(caret)}`;
    setText(next);
    setSuggest(null);
    requestAnimationFrame(() => {
      const pos = suggest.start + p.name.length + 2;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  const submit = async () => {
    if (sending || !text.trim() || tooLong) return;
    setSending(true);
    setError(null);
    const r = await sendMessage(channel.id, text);
    setSending(false);
    if (r.ok) setText('');
    else setError(r.error);
    ref.current?.focus();
  };

  const placeholder = channel.kind === 'dm' ? `Message ${channel.dmWith?.name ?? ''}` : `Message #${channel.name}`;

  return (
    <div className="relative shrink-0 border-t border-line px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      {suggest && matches.length > 0 && (
        <ul role="listbox" aria-label="Mention someone" className="absolute inset-x-3 bottom-full mb-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-md">
          {matches.map((p, i) => (
            <li key={p.email} role="option" aria-selected={i === suggest.index}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(p);
                }}
                className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-body', i === suggest.index ? 'bg-selected-soft text-selected-soft-fg' : 'text-fg hover:bg-subtle')}
              >
                <Avatar name={p.name} size="sm" />
                <span className="truncate font-medium">{p.name}</span>
                <span className="ml-auto truncate text-caption text-fg-tertiary">{p.role}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-invalid={tooLong || undefined}
          onChange={(e) => {
            setText(e.target.value);
            updateSuggest(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={(e) => {
            if (suggest && matches.length) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const d = e.key === 'ArrowDown' ? 1 : -1;
                setSuggest({ ...suggest, index: (suggest.index + d + matches.length) % matches.length });
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                insertMention(matches[suggest.index]);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setSuggest(null);
                return;
              }
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          onBlur={() => setSuggest(null)}
          className="focus-ring max-h-40 min-h-9 w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2 text-body text-fg placeholder:text-fg-tertiary aria-invalid:border-danger-fg"
        />
        {!canManage && channel.kind !== 'managers' && (
          <IconButton
            label="Ask a supervisor for help"
            variant="secondary"
            onClick={async () => {
              const r = await requestFloorHelp({});
              toast({ message: r.ok ? 'Help requested. A supervisor will be with you shortly.' : r.error });
            }}
          >
            <LifeBuoy className="size-4" />
          </IconButton>
        )}
        <IconButton type="submit" label="Send message" variant="primary" disabled={sending || !text.trim() || tooLong}>
          <SendHorizontal className="size-4" />
        </IconButton>
      </form>
      <div className="mt-1 flex min-h-4 items-center justify-between gap-2 text-caption">
        <span className={error ? 'text-danger-fg' : 'text-fg-tertiary'}>{error ?? <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line · @ to mention</span>}</span>
        {text.length > CHAT_BODY_MAX - 200 && (
          <span className={cn('tabular-nums', tooLong ? 'text-danger-fg' : 'text-fg-tertiary')}>
            {text.length}/{CHAT_BODY_MAX}
          </span>
        )}
      </div>
    </div>
  );
}
