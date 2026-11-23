/**
 * Activity checklist: the things a rep ticks off for a lead ("sent a connection request today").
 *
 * A tick is one entry in the lead's activity timeline (footprint) that carries the activity's
 * stable `activityKey`. The checklist shows today's ticks (the browser's local day); earlier days
 * stay in the timeline as history. Plain module: no storage access, safe to reuse anywhere.
 */
import type { LeadFootprintItem } from '@/lib/leadStore';

export interface LeadActivityOption {
  /** Stable id stored on the timeline entry. Never rename one that is already in use. */
  key: string;
  label: string;
}

export interface LeadActivityGroup {
  type: Extract<LeadFootprintItem['type'], 'linkedin' | 'email' | 'call'>;
  label: string;
  items: readonly LeadActivityOption[];
}

export const LEAD_ACTIVITY_CHECKLIST: readonly LeadActivityGroup[] = [
  {
    type: 'linkedin',
    label: 'LinkedIn',
    items: [
      { key: 'linkedin_connection_request', label: 'Sent connection request' },
      { key: 'linkedin_connection_accepted', label: 'Connection accepted' },
      { key: 'linkedin_engaged_posts', label: 'Engaged with their posts' },
      { key: 'linkedin_message', label: 'Sent LinkedIn message' },
    ],
  },
  {
    type: 'email',
    label: 'Email',
    items: [
      { key: 'email_first_cold', label: 'Sent 1st cold email' },
      { key: 'email_follow_up', label: 'Sent follow-up email' },
    ],
  },
  {
    type: 'call',
    label: 'Call',
    items: [
      { key: 'call_no_answer', label: 'Called, no answer' },
      { key: 'call_spoke', label: 'Spoke with them' },
    ],
  },
];

export const LEAD_ACTIVITY_TICK_SUMMARY = 'Ticked on the activity checklist';

/** Local calendar day, e.g. "2026-11-23". Empty for a date that cannot be read. */
export function localDayKey(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface LeadActivityState {
  /** Timeline entry ids for this activity recorded today (normally none or one). */
  todayIds: string[];
  /** How many times it was recorded on earlier days. */
  earlierCount: number;
  /** Most recent earlier day it was recorded, e.g. "Nov 20". */
  earlierLast: string;
}

/** Today's ticks and the earlier history for every checklist activity on one lead. */
export function getLeadActivityState(
  footprint: readonly LeadFootprintItem[] | undefined,
  now: Date = new Date()
): Record<string, LeadActivityState> {
  const today = localDayKey(now);
  const state: Record<string, LeadActivityState> = {};
  const lastTime: Record<string, number> = {};
  for (const group of LEAD_ACTIVITY_CHECKLIST) {
    for (const item of group.items) state[item.key] = { todayIds: [], earlierCount: 0, earlierLast: '' };
  }
  for (const fp of footprint || []) {
    const entry = fp.activityKey ? state[fp.activityKey] : undefined;
    if (!entry) continue;
    const when = new Date(fp.isoDate);
    const day = localDayKey(when);
    if (!day) continue;
    if (day === today) {
      entry.todayIds.push(fp.id);
    } else {
      entry.earlierCount += 1;
      if (when.getTime() > (lastTime[fp.activityKey as string] ?? -Infinity)) {
        lastTime[fp.activityKey as string] = when.getTime();
        entry.earlierLast = when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    }
  }
  return state;
}
