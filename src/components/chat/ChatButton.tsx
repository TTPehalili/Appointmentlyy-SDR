'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Drawer, IconButton } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useChatConnection, useChatState, useChatUnread } from '@/lib/chatClient';
import { TeamChat } from './TeamChat';

const iconClass =
  'focus-ring relative inline-flex size-9 items-center justify-center rounded-md text-fg-secondary transition-colors duration-150 hover:bg-subtle hover:text-fg';

/**
 * Top-bar chat button with the unread badge. Opens team chat in a right drawer (full width on
 * phones). It also keeps the shared chat connection open while the app shell is on screen, so the
 * badge, presence heartbeat and Dialer helpers work on every page.
 */
export function ChatButton() {
  const { email, tenantCode, isAuthenticated } = useSession();
  useChatConnection(isAuthenticated && email ? `${email.toLowerCase()}|${tenantCode}` : null);
  const { status } = useChatState();
  const { total, mentions } = useChatUnread();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);

  if (status === 'signed-out') return null;
  const label = total ? `Team chat, ${total} unread${mentions ? `, ${mentions} mentioning you` : ''}` : 'Team chat';
  const badge = total > 0 && (
    <span
      className={cn(
        'pointer-events-none absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-selected px-1 text-[10px] font-semibold leading-none text-selected-fg tabular-nums ring-2 ring-app',
      )}
      aria-hidden
    >
      {mentions ? '@' : ''}
      {total > 99 ? '99+' : total}
    </span>
  );

  // On the chat page itself the button just marks where you are.
  if (pathname === '/chat' || pathname.startsWith('/chat/')) {
    return (
      <Link href="/chat" aria-label={label} title={label} aria-current="page" className={cn(iconClass, 'bg-selected-soft text-selected-soft-fg hover:bg-selected-soft')}>
        <MessagesSquare className="size-5 stroke-[1.5]" />
        {badge}
      </Link>
    );
  }

  return (
    <>
      <IconButton label={label} aria-expanded={open} onClick={() => setOpen(true)} className={cn('relative', open && 'bg-selected-soft text-selected-soft-fg')}>
        <MessagesSquare className="size-5 stroke-[1.5]" />
        {badge}
      </IconButton>
      <Drawer open={open} onClose={close} bare label="Team chat">
        <TeamChat variant="drawer" open={open} onClose={close} />
      </Drawer>
    </>
  );
}
