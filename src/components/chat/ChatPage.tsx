'use client';

import { PageHeader } from '@/components/ui';
import { TeamChat } from './TeamChat';

/** /chat: the same team chat as the top-bar drawer, as a two-pane page (one pane at a time on phones). */
export function ChatPage() {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-app px-3 pb-3 pt-4 md:px-8 md:pb-6 md:pt-6">
      <PageHeader title="Team chat" description="Talk to the floor, reach your supervisors and message teammates directly." className="hidden pb-4 sm:flex" />
      <TeamChat variant="page" />
    </div>
  );
}
