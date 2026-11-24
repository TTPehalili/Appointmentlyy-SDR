/**
 * Activity checklist: the things a rep ticks off for a lead ("sent a connection request today").
 *
 * A tick is one entry in the lead's activity timeline (footprint) that carries the activity's
 * stable `activityKey`. A box stays ticked once the activity has been recorded for the lead (any
 * day), with the date it was last done, so the checklist reads as a progress tracker. Doing it
 * again on a later day adds another entry. Plain module: no storage access, safe to reuse anywhere.
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
  /** How many times this activity was recorded for the lead (0 = not ticked). */
  count: number;
  /** Timeline entry id of the most recent time (the one an untick removes), or '' when never done. */
  lastId: string;
  /** True when the most recent time is today (local day): it cannot be logged again today. */
  doneToday: boolean;
  /** When it was last done: "Today", "Nov 23", or "Nov 23, 2025" for another year. '' when never done or the date cannot be read. */
  lastLabel: string;
  /** What to show next to the label: "Nov 23", "Today", "3x, last Nov 25". '' when never done. */
  hint: string;
}

/** "Today", "Nov 23", or "Nov 23, 2025" when it is not this year. */
export function activityDateLabel(when: Date, now: Date = new Date()): string {
  if (Number.isNaN(when.getTime())) return '';
  if (localDayKey(when) === localDayKey(now)) return 'Today';
  return when.toLocaleDateString('en-US', when.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Where every checklist activity stands on one lead: ticked when it was ever recorded, with the
 * most recent date and how many times. `now` is injectable for tests.
 */
export function getLeadActivityState(
  footprint: readonly LeadFootprintItem[] | undefined,
  now: Date = new Date()
): Record<string, LeadActivityState> {
  const state: Record<string, LeadActivityState> = {};
  const lastTime: Record<string, number> = {};
  for (const group of LEAD_ACTIVITY_CHECKLIST) {
    for (const item of group.items) state[item.key] = { count: 0, lastId: '', doneToday: false, lastLabel: '', hint: '' };
  }
  // The timeline is newest first; on equal times the entry nearer the top wins.
  for (const fp of footprint || []) {
    const key = fp.activityKey;
    const entry = key && Object.prototype.hasOwnProperty.call(state, key) ? state[key] : undefined;
    if (!key || !entry) continue;
    const when = new Date(fp.isoDate);
    // An entry whose date cannot be read still counts as done; it just never wins "most recent".
    const time = Number.isNaN(when.getTime()) ? -Infinity : when.getTime();
    entry.count += 1;
    if (entry.count === 1 || time > lastTime[key]) {
      lastTime[key] = time;
      entry.lastId = fp.id;
      entry.lastLabel = activityDateLabel(when, now);
      entry.doneToday = entry.lastLabel === 'Today';
    }
  }
  for (const entry of Object.values(state)) {
    if (entry.count === 1) entry.hint = entry.lastLabel;
    else if (entry.count > 1) entry.hint = entry.lastLabel ? `${entry.count}x, last ${entry.lastLabel}` : `${entry.count}x`;
  }
  return state;
}
