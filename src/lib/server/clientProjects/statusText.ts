/**
 * Server only. Plain-text status documents built from the board state alone (no AI, no documents):
 * the client-facing progress note, the weekly Delivery Report text, the Readiness Notice, and the
 * fixed client reminder. They are drafts for the owner to copy or approve; nothing here sends.
 */
import { delayRows, taskKey, today } from '@/lib/server/clientProjects/core';
import { eventText } from '@/components/clientProjects/eventText';
import {
  PHASES,
  PHASE_LABEL,
  SEVERITY_LABEL,
  STATUS_LABEL,
  addBusinessDays,
  defectStatusLabel,
  fmtAt,
  fmtDateLong,
  isOverdue,
  progressOf,
  type CpEvent,
  type Project,
  type Task,
} from '@/lib/clientProjects/types';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const bullet = (items: string[], none: string) => (items.length ? items.map((s) => `- ${s}`).join('\n') : `- ${none}`);

/** A short progress note for the client: only client-visible cards, no internal wording. */
export function buildClientUpdate(p: Project, tasks: Task[], now = today()): string {
  const vis = tasks.filter((t) => t.clientVisible && t.type !== 'defect');
  const prog = progressOf(vis);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const doneRecently = vis.filter((t) => t.status === 'done' && (t.doneAt ?? '') >= weekAgo).map((t) => t.title);
  const horizon = addBusinessDays(now, 5);
  const next = vis.filter((t) => t.status !== 'done' && t.ownerSide === 'us' && t.dueDate && t.dueDate <= horizon).map((t) => `${t.title} (${fmtDateLong(t.dueDate)})`);
  const yours = vis
    .filter((t) => t.status !== 'done' && t.ownerSide === 'client' && t.dueDate && t.dueDate <= horizon)
    .map((t) => `${t.title} (due ${fmtDateLong(t.dueDate)}${isOverdue(t, now) ? ', overdue' : ''}${t.clientClaimedAt ? '; you told us this is done, we are confirming it' : ''})`);
  const defects = tasks.filter((t) => t.clientVisible && t.type === 'defect' && !(t.status === 'done' && t.retestConfirmed));
  return [
    `Progress: ${prog.done} of ${prog.total} items done (${pct(prog.value)}).${p.targetGoLive ? ` Target go-live: ${fmtDateLong(p.targetGoLive)}.` : ''}`,
    '',
    'Done in the last 7 days:',
    bullet(doneRecently.slice(0, 8), 'Nothing closed this week.'),
    '',
    'Coming up from us:',
    bullet(next.slice(0, 8), 'Nothing due in the next 5 business days.'),
    '',
    'Waiting on you:',
    bullet(yours.slice(0, 8), 'Nothing right now. Thank you.'),
    ...(defects.length ? ['', `UAT issues open: ${defects.length}.`] : []),
  ].join('\n');
}

/** The weekly Delivery Report text (cl. 10A): work done, what is next, client items, delays, defects. */
export function buildDeliveryReport(p: Project, tasks: Task[], events: CpEvent[], now = today()): string {
  const road = tasks.filter((t) => t.type !== 'defect');
  const prog = progressOf(road);
  const key = (t: Task) => taskKey(p, t);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const done = road.filter((t) => t.status === 'done' && (t.doneAt ?? '') >= weekAgo);
  const horizon = addBusinessDays(now, 5);
  const upcoming = road.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate <= horizon && t.ownerSide === 'us');
  const clientOpen = road.filter((t) => t.status !== 'done' && t.ownerSide === 'client' && t.dueDate && t.dueDate <= horizon);
  const delays = delayRows(p, tasks, events, now);
  const defects = tasks.filter((t) => t.type === 'defect');
  const gates = road.filter((t) => t.type === 'milestone');
  const lines = [
    `DELIVERY REPORT: ${p.clientName}`,
    `Report date: ${fmtDateLong(now)}`,
    `Kickoff: ${fmtDateLong(p.kickoffDate)}   Target go-live: ${fmtDateLong(p.targetGoLive)}`,
    `Overall progress: ${prog.done} of ${prog.total} items done (${pct(prog.value)})`,
    '',
    '1. WORK COMPLETED THIS WEEK',
    bullet(done.map((t) => `${key(t)} ${t.title}${t.evidence.length ? ` (evidence: ${t.evidence.join(', ')})` : ''}${(t.doneBy ?? '').startsWith('client:') ? ` (ticked by ${(t.doneBy as string).slice(7)}, self-identified via the shared link)` : ''}`), 'None.'),
    '',
    '2. MILESTONES',
    bullet(gates.map((t) => `${t.title}: ${STATUS_LABEL[t.status]}${t.dueDate ? ` (target ${fmtDateLong(t.dueDate)})` : ''}`), 'None set.'),
    '',
    '3. PLANNED FOR THE NEXT 5 BUSINESS DAYS',
    bullet(upcoming.map((t) => `${key(t)} ${t.title} (due ${fmtDateLong(t.dueDate)}${isOverdue(t, now) ? ', overdue' : ''})`), 'None.'),
    '',
    '4. ITEMS WAITING ON THE CLIENT',
    bullet(clientOpen.map((t) => `${key(t)} ${t.title} (due ${fmtDateLong(t.dueDate)}${isOverdue(t, now) ? ', overdue' : ''})${t.clientClaimedAt ? ` [NOT DONE: the client reports it done; awaiting our confirmation. Reported by ${t.clientClaimedBy || 'the client'}, self-identified via the shared link]` : ''}`), 'None.'),
    '',
    '5. CLIENT DELAYS (Business Days)',
    bullet(
      delays.map((d) => `${d.key} ${d.title}: due ${fmtDateLong(d.dueDate)}, ${d.state === 'open' ? `still open, ${d.days} day(s) late so far` : `completed ${d.days} day(s) late`}`),
      'None recorded.',
    ),
  ];
  if (defects.length) {
    lines.push('', '6. UAT DEFECTS');
    lines.push(bullet(defects.map((t) => `${key(t)} [${t.severity ? SEVERITY_LABEL[t.severity] : 'Unclassified'}] ${t.title}: ${defectStatusLabel(t)}${t.dueDate ? ` (fix due ${fmtDateLong(t.dueDate)})` : ''}${t.reportedByClient ? ` (reported by ${t.reportedBy || 'the client'}${t.retestConfirmed ? ', retest confirmed' : ''}, self-identified via the shared link)` : ''}`), 'None.'));
  }
  // Client Intake: what the client submitted, what we accepted or asked to change, what was verified or applied.
  const intake = events.filter((e) => e.type === 'intake' && e.at >= weekAgo && e.detail?.action !== 'draft_saved').sort((a, b) => a.at.localeCompare(b.at));
  if (intake.length) {
    lines.push('', '7. CLIENT INTAKE THIS WEEK');
    lines.push(bullet(intake.slice(-40).map((e) => `${fmtAt(e.at)} ${eventText(e)}${e.actor.startsWith('client:') ? ` (by ${e.actor.slice(7)}, self-identified via the shared link)` : ''}`), 'None.'));
  }
  lines.push('', 'Names on client actions (ticks, "done" reports, defect reports, retests, form submissions) are as typed or picked on the shared board link: self-identified, not signatures.');
  lines.push('', 'Please confirm this report within 2 Business Days. After that it is treated as confirmed.');
  return lines.join('\n');
}

/** Drafted when the Readiness milestone is marked Done. The owner reviews and sends it themselves. */
export function buildReadinessNotice(p: Project, tasks: Task[], now = today()): string {
  const delivered = PHASES.flatMap((ph) => tasks.filter((t) => t.phase === ph && t.clientVisible && t.ownerSide === 'us' && t.type === 'task' && t.deliverableRef && t.status === 'done'));
  const open = tasks.filter((t) => t.clientVisible && t.type !== 'defect' && t.ownerSide === 'us' && t.status !== 'done' && (t.phase === 'before_kickoff' || t.phase === 'week_1' || t.phase === 'week_2'));
  return [
    `READINESS NOTICE: ${p.clientName}`,
    `Date: ${fmtDateLong(now)}`,
    '',
    `We confirm that the platform is ready for your User Acceptance Testing (UAT).`,
    '',
    'Ready for testing:',
    bullet(delivered.map((t) => `Deliverable ${t.deliverableRef}: ${t.title}`), 'See the shared board for the full list.'),
    ...(open.length ? ['', 'Still in progress (not blocking UAT unless noted):', bullet(open.map((t) => t.title), '')] : []),
    '',
    `UAT window: 5 Business Days from this notice, ending ${fmtDateLong(addBusinessDays(now, 5))}.`,
    'Please test against the attached checklist and report any issue on the shared board (UAT issues), with steps and a proposed severity (S1 Critical, S2 Major, S3 Minor, S4 Cosmetic).',
    'Each issue is classified the same day. Fix targets: S1 within 2 Business Days, S2 within 5 Business Days, S3 and S4 within 15 Business Days.',
    '',
    'DRAFT: review, attach the test checklist and send it yourself. Nothing has been sent.',
  ].join('\n');
}

/** Rule 4: the fixed reminder to the client contact. No AI text. */
export function buildClientReminder(p: Project, soon: Task[], overdue: Task[], url: string): { subject: string; lines: string[] } {
  const lines = [`Hello,`, `This is a reminder about your onboarding items for ${p.clientName}.`];
  if (overdue.length) lines.push('Now overdue:', ...overdue.map((t) => `- ${t.title} (was due ${fmtDateLong(t.dueDate)})`));
  if (soon.length) lines.push('Due soon:', ...soon.map((t) => `- ${t.title} (due ${fmtDateLong(t.dueDate)})`));
  lines.push('You can tick items off and leave comments on your project board:', url, 'Late items can move the go-live date, so please tell us early if something is stuck.');
  return { subject: `Reminder: ${overdue.length ? 'items overdue' : 'items due soon'} for your ${p.clientName} onboarding`, lines };
}

export { PHASE_LABEL };
