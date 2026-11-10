import { can } from '@/lib/permissions';
import type { UserRole } from '@/lib/session';

export interface TourStep {
  id: string;
  /** `data-tour` value of the element to spotlight. No target: a centred card. */
  target?: string;
  title: string;
  /** What it's for. */
  body: string;
  /** Why it matters: how it helps hit target. */
  why?: string;
}

/** Bottom tab bar on phones: these nav items have their own tab, the rest sit under More. */
export const MOBILE_TAB_IDS = ['dialer', 'inbox', 'contacts', 'pipeline'];

/**
 * The tour, built for one person. Only sections they can see in the menu get a step
 * (`navIds` = the ids from useVisibleNav), so a rep never hears about Admin or the Live floor.
 * Copy: plain, friendly, short. No product name, since client workspaces are white-labelled.
 */
export function buildTourSteps({
  navIds,
  role,
  firstName,
}: {
  navIds: ReadonlySet<string>;
  role: UserRole;
  firstName: string;
}): TourStep[] {
  const isLead = can(role, 'team'); // Supervisor, Manager and up
  const isOrgAdmin = can(role, 'adminOrg'); // client admin and up

  const sections: (TourStep & { nav?: string })[] = [
    {
      id: 'dialer',
      nav: 'dialer',
      title: 'Dialer',
      body: 'Your calling cockpit. Call leads in one click, follow the talk track, log the outcome and book meetings without switching tabs.',
      why: 'Less clicking between calls means more conversations, and more meetings booked.',
    },
    {
      id: 'inbox',
      nav: 'inbox',
      title: 'Inbox',
      body: 'Replies and sent emails from your mailbox, grouped by conversation. Copilot can suggest a reply for you.',
      why: 'A quick answer to an interested lead is often what turns a reply into a meeting.',
    },
    {
      id: 'contacts',
      nav: 'contacts',
      title: 'Contacts',
      body: 'Every lead in your workspace, with notes, touch history and who owns it. Search by name, company, email or status.',
      why: 'Know who you’re calling and what was said last time, so every call picks up where the last one left off.',
    },
    {
      id: 'pipeline',
      nav: 'pipeline',
      title: 'Pipeline',
      body: 'Your deals on a board, one column per stage. Drag a lead to the next stage and add notes and next steps.',
      why: 'See at a glance who needs a follow-up, so no warm lead slips through.',
    },
    {
      id: 'lead-finder',
      nav: 'lead-finder',
      title: 'Lead Finder',
      body: 'Describe your ideal customer and get a list of verified decision-makers, split evenly across your reps.',
      why: 'A full list of the right people keeps the team dialing instead of searching.',
    },
    {
      id: 'outreach',
      nav: 'outreach',
      title: 'Outreach',
      body: 'Write, check and send one-to-one cold emails, and plan LinkedIn posts from your prospect data.',
      why: 'Leads who’ve already heard from you are warmer when you call.',
    },
    {
      id: 'practice',
      nav: 'practice',
      title: 'Practice',
      body: 'Practise cold calls with an AI buyer, then get a scorecard on how you handled the objection.',
      why: 'Rehearse the tough calls here, so the real ones go better.',
    },
    {
      id: 'reports',
      nav: 'reports',
      title: 'Reports',
      body: isLead
        ? 'Calls, emails, meetings booked and do-not-call compliance across your team, by day, week or month.'
        : 'Your calls, bookings and progress to target, by day, week or month.',
      why: isLead
        ? 'Spot who’s ahead and who needs help while there’s still time to hit target.'
        : 'See where you stand each day, so you know what it takes to hit target.',
    },
    {
      id: 'live-floor',
      nav: 'live-floor',
      title: 'Live floor',
      body: 'See who is on a call right now, listen in, and whisper coaching tips to a rep.',
      why: 'Coach in the moment, when it can still change how the call ends.',
    },
    {
      id: 'help',
      nav: 'help',
      title: 'Help',
      body: 'Step-by-step guides for calling, practice and every other part of the app.',
      why: 'Stuck on something? The answer is usually one click away.',
    },
    {
      id: 'admin',
      nav: 'admin',
      title: 'Admin',
      body: isOrgAdmin
        ? 'Set up your workspace. Start by inviting your team in Admin › Members & seats, then set your brand colour in Admin › Branding & domains.'
        : 'Set up your team: rep roster, playbooks, call outcomes, training and lead credits.',
      why: isOrgAdmin
        ? 'Once your team is in, everyone works from the same leads, scripts and playbooks.'
        : 'Good setup here keeps every rep on the same playbook and your numbers clean.',
    },
  ];

  return [
    {
      id: 'welcome',
      title: firstName ? `Welcome, ${firstName}` : 'Welcome aboard',
      body: 'Here’s a one-minute look around. We’ll point at each part of the menu so you know where everything lives.',
      why: 'Use the arrow keys or the buttons below. You can skip any time.',
    },
    ...sections
      .filter((s) => !s.nav || navIds.has(s.nav))
      .map(({ nav, ...s }) => ({ ...s, target: nav })),
    {
      id: 'profile',
      target: 'profile',
      title: 'Your profile and settings',
      body: 'Click your name to open Settings. Change your password, pick light or dark mode, and sign out.',
      why: 'Dark mode is easier on the eyes on long shifts.',
    },
    {
      id: 'finish',
      title: 'You’re ready',
      body: 'Replay this tour any time from Settings or by searching “tour”.',
      why: navIds.has('dialer') ? 'Good luck out there. The Dialer is a good place to start.' : 'Good luck out there.',
    },
  ];
}
