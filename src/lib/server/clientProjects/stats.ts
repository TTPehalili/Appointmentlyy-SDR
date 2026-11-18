/**
 * Client Projects: server-computed FACTS about a project. Pure functions (no store, no clock unless
 * passed in, no AI), so they are unit-testable and are the single source of numbers for the
 * Dashboard, the cross-project health chips and Copilot. Copilot never counts cards itself: it is
 * given these results and may only phrase them.
 *
 * Definitions (all dates are Manila calendar days, YYYY-MM-DD; "Business Days" are Mon-Fri):
 *  - roadmap cards     every card that is not a defect (defects are counted separately);
 *  - done today        roadmap cards whose doneAt falls on `asOf`;
 *  - this week         Monday to Sunday of the week that contains `asOf`;
 *  - goal              "planned to date" = roadmap cards whose due date is on or before `asOf`; they
 *                      should be done. The goal reports how many of those are done, and the gap;
 *  - overdue           open cards (any type) whose due date is before `asOf`;
 *  - due soon          open cards due after `asOf`, within the next 7 calendar days;
 *  - blocked           open cards in the Blocked column, or waiting on a card that is not done;
 *  - waiting on client open client-owned roadmap cards that are due (on or before `asOf`) or that one
 *                      of our open cards waits on; `days` is Business Days past the due date;
 *  - client delay days Business Days late on client-owned cards: still open (so far) + finished late.
 */
import {
  HEALTH_LABEL,
  addBusinessDays,
  businessDaysBetween,
  todayManila,
  type Health,
  type OwnerSide,
  type Person,
  type Priority,
  type Project,
  type Severity,
  type Task,
  type TaskStatus,
  type TaskType,
} from '@/lib/clientProjects/types';

export interface CardRef {
  key: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  ownerSide: OwnerSide;
  assignee: string | null;
  dueDate: string | null;
  priority: Priority | null;
  /** Business Days past the due date (0 when not overdue). */
  daysLate: number;
  /** Manila day it was done, or null. */
  doneDay: string | null;
}

export interface WorkloadRow {
  personId: string | null;
  name: string;
  side: OwnerSide | null;
  open: number;
  overdue: number;
  dueThisWeek: number;
  doneThisWeek: number;
  openEstimateHours: number;
}

export interface BurnPoint {
  date: string;
  /** Roadmap cards done by the end of that day. */
  done: number;
  /** Roadmap cards due on or before that day. */
  planned: number;
  /** Roadmap cards in the project now (a flat line). */
  scope: number;
}

export interface ProjectStats {
  asOf: string;
  week: { from: string; to: string };
  project: { id: string; key: string; clientName: string; title: string; status: Project['status']; kickoffDate: string; targetGoLive: string | null };
  totals: { cards: number; done: number; open: number; percentDone: number };
  doneToday: CardRef[];
  doneThisWeek: CardRef[];
  dueToday: CardRef[];
  dueThisWeek: CardRef[];
  goal: { plannedToDate: number; doneOfPlanned: number; gap: number; onTrack: boolean; missing: CardRef[] };
  overdue: CardRef[];
  overdueUs: number;
  overdueClient: number;
  dueSoon: CardRef[];
  blocked: (CardRef & { waitingOn: string[] })[];
  waitingOnClient: { count: number; days: number; cards: CardRef[] };
  awaitingOurConfirmation: CardRef[];
  clientDelay: { openDays: number; doneLateDays: number; totalDays: number; items: number };
  nextMilestone: (CardRef & { daysTo: number; businessDaysTo: number }) | null;
  goLive: { date: string | null; daysTo: number | null; done: boolean };
  defects: { open: number; overdue: number; bySeverity: Record<Severity | 'unclassified', number> };
  workload: WorkloadRow[];
  health: Health;
  healthLabel: string;
  healthReasons: string[];
  /** Only when a date range was asked for. */
  range?: { from: string; to: string; done: CardRef[]; due: CardRef[]; created: number };
}

const keyOf = (p: Pick<Project, 'key'>, t: Pick<Task, 'num'>) => `${p.key}-${t.num}`;
const utc = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => {
  const x = utc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return iso(x);
};
export const daysBetween = (from: string, to: string) => Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);
/** Monday and Sunday of the week that contains `d`. */
export function weekOf(d: string): { from: string; to: string } {
  const dow = (utc(d).getUTCDay() + 6) % 7; // Monday = 0
  const from = addDays(d, -dow);
  return { from, to: addDays(from, 6) };
}
const doneDayOf = (t: Pick<Task, 'doneAt' | 'status'>) => (t.status === 'done' && t.doneAt ? todayManila(new Date(t.doneAt)) : null);
const bySchedule = (a: Task, b: Task) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.sort - b.sort || a.num - b.num;

export function cardRef(p: Pick<Project, 'key'>, t: Task, people: Person[], asOf: string): CardRef {
  const open = t.status !== 'done';
  return {
    key: keyOf(p, t),
    title: t.title,
    type: t.type,
    status: t.status,
    ownerSide: t.ownerSide,
    assignee: people.find((x) => x.id === t.assigneeId)?.name ?? null,
    dueDate: t.dueDate,
    priority: t.priority ?? null,
    daysLate: open && t.dueDate && t.dueDate < asOf ? businessDaysBetween(t.dueDate, asOf) : 0,
    doneDay: doneDayOf(t),
  };
}

/**
 * Rule-based health (no AI), the owner-approved SPEC rules, used by the project chip, the home list and
 * Copilot alike:
 *  Late     a milestone is past due, OR 5 or more cards are overdue.
 *  At risk  done is below 90% of planned-to-date, OR a milestone is due within 2 Business Days while a
 *           card it waits on is still open.
 *  On track otherwise. Closed for done and archived projects.
 */
export function healthOf(input: {
  status: Project['status'];
  overdueMilestones: number;
  overdue: number;
  plannedToDate: number;
  doneOfPlanned: number;
  /** Keys of open milestones due within 2 Business Days that wait on an open card. */
  blockedMilestonesSoon: string[];
}): { health: Health; reasons: string[] } {
  if (input.status === 'done' || input.status === 'archived') return { health: 'closed', reasons: [`The project is ${input.status}.`] };
  const late: string[] = [];
  if (input.overdueMilestones) late.push(`${input.overdueMilestones} milestone${input.overdueMilestones === 1 ? ' is' : 's are'} past due.`);
  if (input.overdue >= 5) late.push(`${input.overdue} cards are overdue.`);
  if (late.length) return { health: 'late', reasons: late };
  const risk: string[] = [];
  if (input.plannedToDate > 0 && input.doneOfPlanned < input.plannedToDate * 0.9) risk.push(`${input.doneOfPlanned} of ${input.plannedToDate} cards planned to date are done (below 90%).`);
  if (input.blockedMilestonesSoon.length) risk.push(`Milestone ${input.blockedMilestonesSoon.join(', ')} is due within 2 business days and still waits on an open card.`);
  if (risk.length) return { health: 'at_risk', reasons: risk };
  return { health: 'on_track', reasons: ['No milestone is past due, fewer than 5 cards are overdue, and at least 90% of the work planned to date is done.'] };
}

export function projectStats(p: Project, tasks: Task[], opts: { asOf?: string; range?: { from: string; to: string } } = {}): ProjectStats {
  const asOf = opts.asOf ?? todayManila();
  const people = p.people ?? [];
  const ref = (t: Task) => cardRef(p, t, people, asOf);
  const week = weekOf(asOf);
  const road = tasks.filter((t) => t.type !== 'defect').sort(bySchedule);
  const defects = tasks.filter((t) => t.type === 'defect');
  const isOpen = (t: Task) => t.status !== 'done';
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const done = road.filter((t) => !isOpen(t));
  const doneToday = done.filter((t) => doneDayOf(t) === asOf);
  const doneThisWeek = done.filter((t) => {
    const d = doneDayOf(t);
    return Boolean(d && d >= week.from && d <= week.to);
  });
  const planned = road.filter((t) => t.dueDate && t.dueDate <= asOf);
  const plannedDone = planned.filter((t) => !isOpen(t));
  const missing = planned.filter(isOpen);
  const gap = planned.length - plannedDone.length;

  const overdueAll = tasks.filter((t) => isOpen(t) && t.dueDate && t.dueDate < asOf).sort(bySchedule);
  const overdueRoad = overdueAll.filter((t) => t.type !== 'defect');
  const overdueUs = overdueAll.filter((t) => t.ownerSide === 'us').length;
  const overdueClient = overdueAll.filter((t) => t.ownerSide === 'client').length;
  const soonEnd = addDays(asOf, 7);
  const dueSoon = tasks.filter((t) => isOpen(t) && t.dueDate && t.dueDate > asOf && t.dueDate <= soonEnd).sort(bySchedule);
  const dueToday = tasks.filter((t) => isOpen(t) && t.dueDate === asOf).sort(bySchedule);
  const dueThisWeek = tasks.filter((t) => isOpen(t) && t.dueDate && t.dueDate >= week.from && t.dueDate <= week.to).sort(bySchedule);

  const openBlockersOf = (t: Task) => (t.blockers ?? []).map((id) => byId.get(id)).filter((b): b is Task => Boolean(b) && isOpen(b as Task));
  const blocked = tasks
    .filter((t) => isOpen(t) && (t.status === 'blocked' || openBlockersOf(t).length > 0))
    .sort(bySchedule)
    .map((t) => ({ ...ref(t), waitingOn: openBlockersOf(t).map((b) => keyOf(p, b)) }));

  const neededByUs = new Set(tasks.filter((t) => isOpen(t) && t.ownerSide === 'us').flatMap((t) => openBlockersOf(t).map((b) => b.id)));
  const waiting = road.filter((t) => isOpen(t) && t.ownerSide === 'client' && ((t.dueDate && t.dueDate <= asOf) || neededByUs.has(t.id)));
  const waitingRefs = waiting.map(ref);
  const awaiting = road.filter((t) => isOpen(t) && Boolean(t.clientClaimedAt)).map(ref);

  let openDays = 0;
  let doneLateDays = 0;
  let delayItems = 0;
  for (const t of road) {
    if (t.ownerSide !== 'client' || !t.dueDate) continue;
    if (isOpen(t)) {
      if (t.dueDate < asOf) {
        openDays += businessDaysBetween(t.dueDate, asOf);
        delayItems++;
      }
    } else {
      const d = doneDayOf(t);
      if (d && d > t.dueDate) {
        doneLateDays += businessDaysBetween(t.dueDate, d);
        delayItems++;
      }
    }
  }

  const openMilestones = road.filter((t) => t.type === 'milestone' && isOpen(t) && t.dueDate);
  const nm = openMilestones[0] ?? null;
  const nextMilestone = nm ? { ...ref(nm), daysTo: daysBetween(asOf, nm.dueDate as string), businessDaysTo: (nm.dueDate as string) >= asOf ? businessDaysBetween(asOf, nm.dueDate as string) : -businessDaysBetween(nm.dueDate as string, asOf) } : null;
  const goLiveCard = road.find((t) => t.sopKey === 'go-live') ?? null;
  const goLiveDone = goLiveCard ? !isOpen(goLiveCard) : false;
  const goLive = { date: p.targetGoLive, daysTo: p.targetGoLive ? daysBetween(asOf, p.targetGoLive) : null, done: goLiveDone };

  const openDefects = defects.filter(isOpen);
  const bySeverity: Record<Severity | 'unclassified', number> = { S1: 0, S2: 0, S3: 0, S4: 0, unclassified: 0 };
  for (const d of openDefects) bySeverity[d.severity ?? 'unclassified']++;

  // Workload: one row per person with cards, then "Unassigned" (always last when it has cards).
  const rows = new Map<string, WorkloadRow>();
  const rowFor = (t: Task) => {
    const person = people.find((x) => x.id === t.assigneeId) ?? null;
    const id = person?.id ?? '';
    if (!rows.has(id)) rows.set(id, { personId: person?.id ?? null, name: person?.name ?? 'Unassigned', side: person?.side ?? null, open: 0, overdue: 0, dueThisWeek: 0, doneThisWeek: 0, openEstimateHours: 0 });
    return rows.get(id) as WorkloadRow;
  };
  for (const person of people) rows.set(person.id, { personId: person.id, name: person.name, side: person.side, open: 0, overdue: 0, dueThisWeek: 0, doneThisWeek: 0, openEstimateHours: 0 });
  for (const t of tasks) {
    const r = rowFor(t);
    if (isOpen(t)) {
      r.open++;
      if (t.dueDate && t.dueDate < asOf) r.overdue++;
      if (t.dueDate && t.dueDate >= week.from && t.dueDate <= week.to) r.dueThisWeek++;
      r.openEstimateHours = Math.round((r.openEstimateHours + (t.estimateHours ?? 0)) * 100) / 100;
    } else {
      const d = doneDayOf(t);
      if (d && d >= week.from && d <= week.to) r.doneThisWeek++;
    }
  }
  const workload = [...rows.values()].sort((a, b) => Number(a.personId === null) - Number(b.personId === null) || b.open - a.open || a.name.localeCompare(b.name));

  const { health, reasons } = healthOf({
    status: p.status,
    overdueMilestones: overdueRoad.filter((t) => t.type === 'milestone').length,
    overdue: overdueAll.length,
    plannedToDate: planned.length,
    doneOfPlanned: plannedDone.length,
    blockedMilestonesSoon: openMilestones.filter((m) => (m.dueDate as string) >= asOf && businessDaysBetween(asOf, m.dueDate as string) <= 2 && openBlockersOf(m).length > 0).map((m) => keyOf(p, m)),
  });

  const out: ProjectStats = {
    asOf,
    week,
    project: { id: p.id, key: p.key, clientName: p.clientName, title: p.title, status: p.status, kickoffDate: p.kickoffDate, targetGoLive: p.targetGoLive },
    totals: { cards: road.length, done: done.length, open: road.length - done.length, percentDone: road.length ? Math.round((done.length / road.length) * 100) : 0 },
    doneToday: doneToday.map(ref),
    doneThisWeek: doneThisWeek.map(ref),
    dueToday: dueToday.map(ref),
    dueThisWeek: dueThisWeek.map(ref),
    goal: { plannedToDate: planned.length, doneOfPlanned: plannedDone.length, gap, onTrack: gap === 0, missing: missing.map(ref) },
    overdue: overdueAll.map(ref),
    overdueUs,
    overdueClient,
    dueSoon: dueSoon.map(ref),
    blocked,
    waitingOnClient: { count: waitingRefs.length, days: waitingRefs.reduce((n, c) => n + c.daysLate, 0), cards: waitingRefs },
    awaitingOurConfirmation: awaiting,
    clientDelay: { openDays, doneLateDays, totalDays: openDays + doneLateDays, items: delayItems },
    nextMilestone,
    goLive,
    defects: { open: openDefects.length, overdue: openDefects.filter((t) => t.dueDate && t.dueDate < asOf).length, bySeverity },
    workload,
    health,
    healthLabel: HEALTH_LABEL[health],
    healthReasons: reasons,
  };
  if (opts.range) {
    const { from, to } = opts.range;
    out.range = {
      from,
      to,
      done: done.filter((t) => { const d = doneDayOf(t); return Boolean(d && d >= from && d <= to); }).map(ref),
      due: road.filter((t) => t.dueDate && t.dueDate >= from && t.dueDate <= to).map(ref),
      created: tasks.filter((t) => { const d = todayManila(new Date(t.createdAt)); return d >= from && d <= to; }).length,
    };
  }
  return out;
}

/**
 * Burn-up by day, from the earlier of kickoff-5 Business Days and the first due date to the later of
 * today and the last due date (capped at 200 days). `done` only runs to `asOf` (the future is unknown).
 */
export function burnUp(p: Pick<Project, 'kickoffDate' | 'targetGoLive'>, tasks: Task[], asOf: string = todayManila()): (Omit<BurnPoint, 'done'> & { done: number | null })[] {
  const road = tasks.filter((t) => t.type !== 'defect');
  if (!road.length) return [];
  const dues = road.map((t) => t.dueDate).filter((d): d is string => Boolean(d)).sort();
  let from = addBusinessDays(p.kickoffDate, -5);
  if (dues[0] && dues[0] < from) from = dues[0];
  let to = asOf;
  for (const d of [dues[dues.length - 1], p.targetGoLive]) if (d && d > to) to = d;
  if (daysBetween(from, to) > 200) from = addDays(to, -200);
  const doneDays = road.map(doneDayOf).filter((d): d is string => Boolean(d));
  const out: (Omit<BurnPoint, 'done'> & { done: number | null })[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push({
      date: d,
      done: d <= asOf ? doneDays.filter((x) => x <= d).length : null,
      planned: dues.filter((x) => x <= d).length,
      // The scope line is today's scope (the card count now), drawn flat: history of scope changes is not kept.
      scope: road.length,
    });
  }
  return out;
}

// ------------------------------------------------------------------ Copilot tools: tasks and activity

export interface TaskFilter {
  status?: TaskStatus | 'open';
  side?: OwnerSide;
  /** A person's name (case-insensitive, partial) or 'unassigned'. */
  assignee?: string;
  type?: TaskType;
  priority?: Priority;
  overdue?: boolean;
  blocked?: boolean;
  dueFrom?: string;
  dueTo?: string;
  /** Matches the key or the title. */
  text?: string;
  limit?: number;
}

/** project.tasks(filter): the matching cards as facts, soonest due first. `total` is the count before `limit`. */
export function filterTasks(p: Project, tasks: Task[], f: TaskFilter = {}, asOf: string = todayManila()): { total: number; cards: CardRef[] } {
  const people = p.people ?? [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const want = (f.assignee ?? '').trim().toLowerCase();
  const text = (f.text ?? '').trim().toLowerCase();
  const hit = tasks
    .filter((t) => {
      const open = t.status !== 'done';
      if (f.status === 'open' ? !open : f.status && t.status !== f.status) return false;
      if (f.side && t.ownerSide !== f.side) return false;
      if (f.type && t.type !== f.type) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.overdue && !(open && t.dueDate && t.dueDate < asOf)) return false;
      if (f.blocked && !(open && (t.status === 'blocked' || (t.blockers ?? []).some((id) => byId.get(id)?.status !== 'done' && byId.has(id))))) return false;
      if (f.dueFrom && !(t.dueDate && t.dueDate >= f.dueFrom)) return false;
      if (f.dueTo && !(t.dueDate && t.dueDate <= f.dueTo)) return false;
      if (want) {
        const name = people.find((x) => x.id === t.assigneeId)?.name.toLowerCase() ?? '';
        if (want === 'unassigned' ? Boolean(t.assigneeId && name) : !name.includes(want)) return false;
      }
      if (text && !(`${keyOf(p, t)} ${t.title}`.toLowerCase().includes(text))) return false;
      return true;
    })
    .sort(bySchedule);
  const limit = Math.max(1, Math.min(200, Math.trunc(f.limit ?? 60)));
  return { total: hit.length, cards: hit.slice(0, limit).map((t) => cardRef(p, t, people, asOf)) };
}

/** One line per project for the cross-project home and for Copilot's projects.list. */
export interface ProjectRow {
  id: string;
  key: string;
  clientName: string;
  status: Project['status'];
  health: Health;
  healthLabel: string;
  healthReasons: string[];
  percentDone: number;
  done: number;
  cards: number;
  doneToday: number;
  dueToday: number;
  overdue: number;
  goalGap: number;
  plannedToDate: number;
  doneOfPlanned: number;
  waitingOnClient: number;
  blocked: number;
  openDefects: number;
  nextMilestone: { key: string; title: string; dueDate: string | null; daysTo: number } | null;
  targetGoLive: string | null;
}

export function projectRow(s: ProjectStats): ProjectRow {
  return {
    id: s.project.id,
    key: s.project.key,
    clientName: s.project.clientName,
    status: s.project.status,
    health: s.health,
    healthLabel: s.healthLabel,
    healthReasons: s.healthReasons,
    percentDone: s.totals.percentDone,
    done: s.totals.done,
    cards: s.totals.cards,
    doneToday: s.doneToday.length,
    dueToday: s.dueToday.length,
    overdue: s.overdue.length,
    goalGap: s.goal.gap,
    plannedToDate: s.goal.plannedToDate,
    doneOfPlanned: s.goal.doneOfPlanned,
    waitingOnClient: s.waitingOnClient.count,
    blocked: s.blocked.length,
    openDefects: s.defects.open,
    nextMilestone: s.nextMilestone ? { key: s.nextMilestone.key, title: s.nextMilestone.title, dueDate: s.nextMilestone.dueDate, daysTo: s.nextMilestone.daysTo } : null,
    targetGoLive: s.project.targetGoLive,
  };
}
