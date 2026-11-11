'use client';

/**
 * Live progress for a Lead Finder pull (Search -> Found -> Enrich -> Save -> Done).
 *
 * Purely presentational: every number comes from props, which IcpListBuilderHub fills from the
 * NDJSON events streamed by POST /api/intelligence/icp ({ mode: 'pull', stream: true }).
 * Nothing here invents or extrapolates counts, and the feed never invents names: rows show the
 * real company and title from the stream, or "Decision-maker N".
 *
 * Two styles share the same right-hand instrument panel (rolling counters, bar, stats, feed):
 *  - playful: a robot SDR works the pull (cards tossed into a crate, witty rotating lines);
 *  - professional: a calm "signal field" of dots, factual copy.
 * The left stage is decorative (aria-hidden). Only phase changes, milestones, the done summary
 * and the error are announced (one sr-only line inside the polite live region).
 *
 * Styles live in the React 19 <style href precedence> tag below: turbopack compiles every .css
 * file as global CSS, so the panel keeps its rules here, all prefixed appy-pp-.
 */

import * as React from 'react';
import { AlertTriangle, Building2, Check, Clock, Mail, Phone, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';

export type PullProgressPhase = 'connecting' | 'searching' | 'enriching' | 'saving' | 'done' | 'error';
export type PullProgressStyle = 'playful' | 'professional';

/** The row the server enriched most recently (real values from the stream; empty = unknown). */
export interface PullProgressLastLead {
  company: string;
  title?: string;
  /** Whether that row came back with a verified email / a direct phone. */
  hasEmail?: boolean;
  hasPhone?: boolean;
}

export interface PullProgressPanelProps {
  /** Current stage. 'connecting' = request sent, no server event yet. */
  phase: PullProgressPhase;
  /** Leads the user asked for (shown before the search answers). */
  requested: number;
  /** Rows the search returned (null until the `found` event). */
  found: number | null;
  /** Total people matching the ICP (null until the `found` event, or when the provider gave no total). */
  totalMatching: number | null;
  /**
   * True once the provider has no more pages for this pull. Large pulls are searched in batches, so
   * `found` grows while this is false; "N of M requested" is only shown once it is true. Default true.
   */
  searchComplete?: boolean;
  /** Rows enriched so far, and how many will be enriched. */
  done: number;
  total: number;
  /** Enriched rows with a verified work email / a direct phone, so far. */
  withEmail: number;
  withPhone: number;
  /** Leads saved to the folder (set when phase is 'done'). */
  savedCount: number | null;
  folderName: string;
  /** User-facing error message (phase 'error'). */
  error: string | null;
  /** The phase that was active when the error happened, so its step is marked as failed. */
  failedPhase?: PullProgressPhase | null;
  /** Date.now() when the pull started; the panel ticks its own elapsed clock. */
  startedAt: number;
  /** Shown as a Dismiss button in the error state. */
  onDismiss?: () => void;
  className?: string;
  /** Workspace setting (Admin > Branding & domains). Default 'playful'. */
  pullStyle?: PullProgressStyle;
  /** Latest enriched row, for the "Latest enriched" feed. */
  lastLead?: PullProgressLastLead | null;
}

const SLOW_HINT_AFTER_MS = 15_000;
const EASE_OUT = 'cubic-bezier(.16,1,.3,1)';
const EASE_POP = 'cubic-bezier(.34,1.56,.64,1)';
const SVG_NS = 'http://www.w3.org/2000/svg';

type ViewPhase = PullProgressPhase | 'found';

const fmt = (n: number) => n.toLocaleString('en-US');
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const trunc = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/* ------------------------------------------------------------------------------------------------
 * Copy. Sentence case, no em dashes, no emoji, numbers from props only. The joke is always on us,
 * the database or the sales process, never on prospects, roles or companies.
 * ---------------------------------------------------------------------------------------------- */

interface CopyCtx {
  found: number;
  requested: number;
  /** The provider truly returned fewer than requested (search finished short). */
  short: boolean;
  totalMatching: number;
  done: number;
  saved: number;
  folder: string;
}
type Line = string | ((c: CopyCtx) => string);

const FOUND_PRO = (c: CopyCtx) =>
  c.short
    ? `Found ${fmt(c.found)} of the ${fmt(c.requested)} requested.`
    : `Found ${fmt(c.found)} decision-makers`;
const FOUND_FUN = (c: CopyCtx) =>
  c.short
    ? `Found ${fmt(c.found)} of the ${fmt(c.requested)} you asked for. Now for their details.`
    : `Found ${fmt(c.found)} decision-makers. Now for their details.`;

const COPY = {
  eyebrow: {
    connecting: 'Connecting',
    searching: 'Searching',
    found: 'Found',
    enriching: 'Enriching contacts',
    saving: 'Saving',
    done: 'Pull complete',
    error: 'Pull stopped',
  } satisfies Record<ViewPhase, string>,
  pro: {
    connecting: () => 'Connecting to the lead database',
    searching: (c) =>
      c.totalMatching ? `Searching ${fmt(c.totalMatching)} matching profiles` : 'Searching for decision-makers that match your filters',
    found: FOUND_PRO,
    enriching: () => 'Verifying work emails and direct phone numbers',
    saving: (c) => `Saving ${fmt(c.done)} leads to “${c.folder}”`,
    done: (c) => `${fmt(c.saved)} leads added to “${c.folder}”`,
    error: () => "Couldn't finish the pull",
  } satisfies Record<ViewPhase, (c: CopyCtx) => string>,
  quips: {
    connecting: [
      "Waking up the lead database. It's not a morning person.",
      'Stretching before the big pull…',
      'Plugging in a very long extension cord…',
      'Finding the Wi-Fi password…',
      'Clearing our throat before the first call…',
      'Pouring the database a coffee…',
    ],
    searching: [
      'Finding the person who actually owns the budget…',
      (c) =>
        c.totalMatching
          ? `Reading ${fmt(c.totalMatching)} job titles so you don't have to…`
          : "Reading thousands of job titles so you don't have to…",
      'Climbing the org chart, one rung at a time…',
      'Looking past the info@ inbox…',
      'Separating decision-makers from the CC list…',
      'Asking the database very nicely…',
      'Turning your filters into a shortlist…',
    ],
    found: [FOUND_FUN],
    enriching: [
      'Sweet-talking gatekeepers…',
      'Verifying emails so your bounce rate stays boring…',
      'Hunting for direct lines, skipping the switchboard…',
      'Teaching your CRM some new names…',
      'Double-checking every @ and every digit…',
      'Finding numbers that ring a desk, not a fax machine…',
      'Dusting off the digital Rolodex…',
      'Pulling a few strings in the database…',
    ],
    saving: [
      (c) => `Packing ${fmt(c.done)} leads into “${c.folder}”…`,
      'Taping the box shut…',
      "Labeling everything neatly. We're like that.",
      'Splitting the list evenly. No favorites.',
    ],
    done: [
      (c) => `${fmt(c.saved)} fresh leads. Your pipeline says thank you.`,
      (c) => `${fmt(c.saved)} leads delivered. Go book some meetings.`,
      (c) => `${fmt(c.saved)} leads, packed and labeled. Happy dialing.`,
    ],
    error: ['The data cloud is taking a coffee break.', 'Our data provider stepped away from the desk.'],
  } satisfies Record<ViewPhase, Line[]>,
  bubble: {
    connecting: ['One sec…'],
    searching: ['Hmm…', 'Who signs off?', 'Ooh, a director?', 'Getting warmer…'],
    found: ['Found them!'],
    enriching: ['Got a sec?', 'Quick question!', 'Is now a bad time?', "I'll be brief!", 'Love your website!', 'Who handles ops?'],
    saving: ['Packing up…'],
    done: ['Done and dusted!'],
    error: ['brb, coffee'],
  } satisfies Record<ViewPhase, string[]>,
  milestone: { 25: 'Quarter done!', 50: 'Halfway there!', 75: 'Nearly there!' } as Record<number, string>,
  hint: {
    professional: 'Large lists take about a minute. Keep this page open until it finishes.',
    playful: 'Big lists take about a minute. Keep this tab open and grab a coffee.',
  } satisfies Record<PullProgressStyle, string>,
  errorFallback: 'The pull could not be completed. Please retry.',
  /** Only shown when the pull stopped before the save step: the hub deducts credits at that step. */
  errorNothingUsed: 'No leads were added and none of your lead credits were used.',
  errorCheckBalance: 'Check your lead credits balance before you pull again.',
  errorRetry: "Pull again from the button below when you're ready.",
  feedEmpty: "Leads show up here as they're verified.",
};

const resolve = (line: Line, c: CopyCtx) => (typeof line === 'function' ? line(c) : line);

/* ------------------------------------------------------------------------------------------------
 * Hooks
 * ---------------------------------------------------------------------------------------------- */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribeReducedMotion,
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(REDUCED_MOTION_QUERY).matches : false),
    () => false
  );
}

function useElapsed(startedAt: number, running: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!running) {
      // Freeze the clock at the moment the pull ended (not at the last 1 s tick).
      const t = window.setTimeout(() => setNow(Date.now()), 0);
      return () => window.clearTimeout(t);
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running, startedAt]);
  return Math.max(0, now - startedAt);
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Index of the line to show from a list of `count` lines. Opens on line 0 (the best one), then a
 * shuffle bag, so every line shows before any repeats and never twice in a row. Keeps rotating
 * under reduced motion (only the swap animation is dropped, by CSS).
 */
function useRotation(count: number, key: string, ms: number, enabled: boolean): number {
  const [state, setState] = React.useState({ key, idx: 0 });
  React.useEffect(() => {
    if (!enabled || count < 2) return;
    let bag: number[] = [];
    let last = 0;
    let first = true;
    const id = window.setInterval(() => {
      if (!bag.length) {
        bag = Array.from({ length: count }, (_, i) => i).filter((i) => !first || i !== 0);
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        if (bag[0] === last && bag.length > 1) [bag[0], bag[1]] = [bag[1], bag[0]];
        first = false;
      }
      last = bag.shift() as number;
      setState({ key, idx: last });
    }, ms);
    return () => window.clearInterval(id);
  }, [count, key, ms, enabled]);
  return state.key === key && state.idx < count ? state.idx : 0;
}

interface LeadRow {
  n: number;
  email: boolean;
  phone: boolean;
  company?: string;
  title?: string;
}
interface LeadTrack {
  startedAt: number;
  done: number;
  withEmail: number;
  withPhone: number;
  rows: LeadRow[];
}

/**
 * Per-lead email/phone flags, derived from the count deltas (exact when each event adds one lead,
 * which the stream does unless it throttles). The newest row of an event takes the real company,
 * title and flags from `lastLead`; any other hits of a batched event are assigned in order.
 */
function advanceTrack(t: LeadTrack, done: number, withEmail: number, withPhone: number, last?: PullProgressLastLead | null): LeadTrack {
  const k = done - t.done;
  if (k <= 0) return { ...t, done, withEmail, withPhone };
  const rows = t.rows.slice();
  let de = Math.max(0, withEmail - t.withEmail);
  let dp = Math.max(0, withPhone - t.withPhone);
  const lastEmail = typeof last?.hasEmail === 'boolean' ? last.hasEmail && de > 0 : null;
  const lastPhone = typeof last?.hasPhone === 'boolean' ? last.hasPhone && dp > 0 : null;
  if (lastEmail) de -= 1;
  if (lastPhone) dp -= 1;
  for (let j = 0; j < k; j++) {
    const isLast = j === k - 1;
    const row: LeadRow = {
      n: t.done + j + 1,
      email: isLast && lastEmail !== null ? lastEmail : j < de,
      phone: isLast && lastPhone !== null ? lastPhone : j < dp,
    };
    if (isLast && last) {
      const company = (last.company || '').trim();
      const title = (last.title || '').trim();
      if (company) row.company = company;
      if (company && title) row.title = title;
    }
    rows.push(row);
  }
  return { startedAt: t.startedAt, done, withEmail, withPhone, rows };
}

function useLeadHistory(p: PullProgressPanelProps): LeadRow[] {
  const [track, setTrack] = React.useState<LeadTrack>(() =>
    advanceTrack({ startedAt: p.startedAt, done: 0, withEmail: 0, withPhone: 0, rows: [] }, p.done, p.withEmail, p.withPhone, p.lastLead)
  );
  let current = track;
  if (track.startedAt !== p.startedAt || track.done !== p.done) {
    const base =
      track.startedAt !== p.startedAt || p.done < track.done
        ? { startedAt: p.startedAt, done: 0, withEmail: 0, withPhone: 0, rows: [] }
        : track;
    current = advanceTrack(base, p.done, p.withEmail, p.withPhone, p.lastLead);
    setTrack(current);
  }
  return current.rows;
}

/** The "found" beat: phase has no 'found', so derive it, and still land it when found arrives with enriching. */
function useFoundEcho(phase: PullProgressPhase, found: number | null, startedAt: number): boolean {
  const [echo, setEcho] = React.useState({ startedAt, saw: false, on: false });
  let e = echo.startedAt !== startedAt ? { startedAt, saw: false, on: false } : echo;
  if (!e.saw && found !== null && phase === 'searching') e = { ...e, saw: true };
  if (!e.saw && found !== null && phase === 'enriching') e = { ...e, saw: true, on: true };
  if (e !== echo) setEcho(e);
  React.useEffect(() => {
    if (!echo.on) return;
    const t = window.setTimeout(() => setEcho((s) => ({ ...s, on: false })), 2200);
    return () => window.clearTimeout(t);
  }, [echo.on]);
  return e.on && phase === 'enriching';
}

/** 25 / 50 / 75 % milestones: `show` is true for 1.8 s after each one (bubble + announcement). */
function useMilestone(phase: PullProgressPhase, done: number, total: number, startedAt: number) {
  const [ms, setMs] = React.useState({ startedAt, reached: 0, at: 0, show: false });
  let m = ms.startedAt !== startedAt ? { startedAt, reached: 0, at: 0, show: false } : ms;
  if (phase === 'enriching' && total > 0) {
    const r = [75, 50, 25].find((x) => done >= Math.ceil((total * x) / 100)) ?? 0;
    if (r > m.reached) m = { startedAt, reached: r, at: done, show: true };
  }
  if (m !== ms) setMs(m);
  React.useEffect(() => {
    if (!ms.show) return;
    const t = window.setTimeout(() => setMs((s) => ({ ...s, show: false })), 1800);
    return () => window.clearTimeout(t);
  }, [ms.show, ms.reached]);
  return m;
}

/* ------------------------------------------------------------------------------------------------
 * Odometer: a mechanical counter. Each digit is a wheel (0-9 then 0); one shared rAF ticker tweens
 * a continuous value, and wheel i sits at floor(v/10^i)%10 plus a carry fraction while the wheel to
 * its right passes 9 -> 0, so carries always roll forward. Only transforms are written; React
 * re-renders it only when the target's digit count changes. Decreases and reduced motion snap.
 * ---------------------------------------------------------------------------------------------- */

const ODOS = new Set<{ step: (t: number) => boolean }>();
let odoRaf = 0;
function odoTick(t: number) {
  let busy = false;
  ODOS.forEach((o) => {
    if (o.step(t)) busy = true;
  });
  odoRaf = busy ? requestAnimationFrame(odoTick) : 0;
}
const digitCount = (v: number) => String(Math.max(0, Math.round(v))).length;

function Odometer({
  value,
  duration = 450,
  testId,
  className,
}: {
  value: number;
  duration?: number;
  testId?: string;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const wheels = digitCount(value);
  const slots = React.useRef<(HTMLSpanElement | null)[]>([]);
  const cols = React.useRef<(HTMLSpanElement | null)[]>([]);
  const commas = React.useRef<(HTMLSpanElement | null)[]>([]);
  const st = React.useRef({ v: value, from: value, to: value, t0: 0, dur: duration, shown: 0, reduced });
  const durRef = React.useRef(duration);

  const draw = React.useCallback((v: number) => {
    const s = st.current;
    const n = digitCount(v);
    for (let i = 0; i < cols.current.length; i++) {
      const slot = slots.current[i];
      const col = cols.current[i];
      if (!slot || !col) continue;
      const visible = i < n;
      if (visible && slot.style.display === 'none') {
        slot.style.display = '';
        if (s.shown > 0 && !s.reduced) {
          slot.animate([{ transform: 'translateY(.4em)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: EASE_OUT });
        }
      } else if (!visible) {
        slot.style.display = 'none';
      }
      const comma = commas.current[i];
      if (comma) comma.style.display = visible ? '' : 'none';
      if (!visible) continue;
      const pw = 10 ** i;
      const p = i === 0 ? v % 10 : (Math.floor(v / pw) % 10) + Math.max(0, (v % pw) - (pw - 1));
      col.style.transform = `translateY(${((-p / 11) * 100).toFixed(3)}%)`;
    }
    s.shown = n;
  }, []);

  React.useLayoutEffect(() => {
    durRef.current = duration;
    st.current.reduced = reduced;
  });

  // A wheel was added or removed: position the new set.
  React.useLayoutEffect(() => {
    draw(st.current.v);
  }, [wheels, draw]);

  React.useLayoutEffect(() => {
    const s = st.current;
    if (reduced || value < s.to) {
      s.v = s.from = s.to = value;
      draw(value);
      return;
    }
    if (value === s.to && s.v === value) {
      draw(value);
      return;
    }
    s.from = s.v;
    s.to = value;
    s.t0 = performance.now();
    s.dur = durRef.current;
    const anim = {
      step: (t: number) => {
        const k = Math.min(1, (t - s.t0) / s.dur);
        s.v = s.from + (s.to - s.from) * (1 - (1 - k) ** 3);
        draw(s.v);
        if (k >= 1) {
          ODOS.delete(anim);
          return false;
        }
        return true;
      },
    };
    ODOS.add(anim);
    if (!odoRaf) odoRaf = requestAnimationFrame(odoTick);
    return () => {
      ODOS.delete(anim);
    };
  }, [value, reduced, draw]);

  const nodes: React.ReactNode[] = [];
  for (let i = wheels - 1; i >= 0; i--) {
    nodes.push(
      <span
        key={`d${i}`}
        className="appy-pp-os"
        ref={(el) => {
          slots.current[i] = el;
        }}
      >
        <span
          className="appy-pp-oc"
          ref={(el) => {
            cols.current[i] = el;
          }}
        >
          {Array.from({ length: 11 }, (_, k) => (
            <span key={k}>{k % 10}</span>
          ))}
        </span>
      </span>
    );
    if (i > 0 && i % 3 === 0) {
      nodes.push(
        <span
          key={`c${i}`}
          className="appy-pp-os appy-pp-comma"
          ref={(el) => {
            commas.current[i] = el;
          }}
        >
          ,
        </span>
      );
    }
  }
  return (
    <span className={cn('appy-pp-odo', className)} data-testid={testId} data-value={value}>
      <span aria-hidden className="inline-flex">
        {nodes}
      </span>
      <span className="sr-only">{fmt(value)}</span>
    </span>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Small leaf components (their timers do not re-render the panel)
 * ---------------------------------------------------------------------------------------------- */

function ClockText({ startedAt, running, finished }: { startedAt: number; running: boolean; finished: boolean }) {
  const elapsed = useElapsed(startedAt, running);
  return <span>{finished ? `Finished in ${formatElapsed(elapsed)}` : formatElapsed(elapsed)}</span>;
}

function SlowHint({ startedAt, running, text }: { startedAt: number; running: boolean; text: string }) {
  const [shownFor, setShownFor] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setShownFor(startedAt), Math.max(0, startedAt + SLOW_HINT_AFTER_MS - Date.now()));
    return () => window.clearTimeout(t);
  }, [startedAt, running]);
  const on = running && shownFor === startedAt;
  return (
    <div className={cn('appy-pp-hint', on && 'appy-pp-on')} data-testid={on ? 'pull-progress-slow-hint' : undefined}>
      {on && (
        <>
          <Clock aria-hidden />
          <span>{text}</span>
        </>
      )}
    </div>
  );
}

type StepState = '' | 'appy-pp-active' | 'appy-pp-done' | 'appy-pp-err';

function StepsHeader({ view, failedPhase, done }: { view: ViewPhase; failedPhase?: PullProgressPhase | null; done: number }) {
  const idx = ({ connecting: 0, searching: 0, found: 0, enriching: 1, saving: 2, done: 3, error: -1 } as const)[view];
  const errAt =
    view === 'error'
      ? (({ connecting: 0, searching: 0, enriching: 1, saving: 2 } as Partial<Record<PullProgressPhase, number>>)[failedPhase || 'connecting'] ??
        (done > 0 ? 1 : 0))
      : -1;
  const cur = view === 'error' ? errAt : idx;
  const labels = ['Search', 'Enrich', 'Save'];
  const items: React.ReactNode[] = [];
  labels.forEach((label, i) => {
    const state: StepState = view === 'error' && i === errAt ? 'appy-pp-err' : i < cur ? 'appy-pp-done' : i === cur ? 'appy-pp-active' : '';
    items.push(
      <li key={label} className={state || undefined} aria-current={i === cur && view !== 'error' ? 'step' : undefined}>
        <span className="appy-pp-dot" aria-hidden>
          <Check />
        </span>
        {label}
      </li>
    );
    if (i < labels.length - 1) {
      items.push(
        <li key={`w${i}`} aria-hidden className="appy-pp-wire-li">
          <span className={cn('appy-pp-wire', i < cur && 'appy-pp-full', i === cur && view !== 'error' && 'appy-pp-lit')} />
        </li>
      );
    }
  });
  return (
    <ol className="appy-pp-steps" aria-label="Pull steps">
      {items}
    </ol>
  );
}

function RotatingTitle({ lines, ctx, rotateKey, enabled }: { lines: Line[]; ctx: CopyCtx; rotateKey: string; enabled: boolean }) {
  const idx = useRotation(lines.length, rotateKey, 2600, enabled);
  const text = resolve(lines[idx] ?? lines[0], ctx);
  return (
    <p className="appy-pp-title">
      <span key={text} className="appy-pp-title-swap">
        {text}
      </span>
    </p>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Playful stage: robot SDR
 * ---------------------------------------------------------------------------------------------- */

const POSE: Record<ViewPhase, string> = { connecting: 'idle', searching: 'search', found: 'idle', enriching: 'idle', saving: 'idle', done: 'up', error: 'mug' };
const EYES: Record<ViewPhase, string> = { connecting: 'dots', searching: 'n', found: 'wide', enriching: 'n', saving: 'n', done: 'happy', error: 'sleepy' };

const svgId = (raw: string, name: string) => `appy-pp-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}-${name}`;

interface BotStageProps {
  view: ViewPhase;
  wide: boolean;
  total: number;
  done: number;
  crateCount: number;
  folderName: string;
  bubble: string;
  bulbRef: React.Ref<SVGCircleElement>;
  armRef: React.Ref<SVGGElement>;
  crateBodyRef: React.Ref<SVGGElement>;
  flyersRef: React.Ref<SVGGElement>;
}

const BotStage = React.memo(function BotStage({
  view,
  wide,
  total,
  done,
  crateCount,
  folderName,
  bubble,
  bulbRef,
  armRef,
  crateBodyRef,
  flyersRef,
}: BotStageProps) {
  const uid = React.useId();
  const gridId = svgId(uid, 'grid');
  const stripesId = svgId(uid, 'stripes');
  const packed = view === 'saving' || view === 'done';
  const trayScale = total ? (packed ? 0 : Math.max(0, total - done) / total) : 0;
  const crateScale = total && crateCount ? Math.max(0.04, Math.min(1, crateCount / total)) : 0;
  const trayLabel = total ? (done >= total ? 'Queue empty' : `${fmt(total - done)} to go`) : 'Queue';
  const stripes = { fill: `url(#${stripesId})` };
  return (
    <div>
      <svg
        className="appy-pp-scene"
        viewBox="18 22 444 270"
        data-phase={view}
        data-pose={POSE[view]}
        data-eyes={wide ? 'wide' : EYES[view]}
      >
        <defs>
          <pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse">
            <path className="appy-pp-g-line" d="M24 0H0V24" />
          </pattern>
          <pattern id={stripesId} width="8" height="5" patternUnits="userSpaceOnUse">
            <rect width="8" height="5" style={{ fill: 'var(--pp-card)' }} />
            <rect y="4" width="8" height="1" style={{ fill: 'var(--line-strong)' }} />
          </pattern>
        </defs>
        <rect style={{ fill: `url(#${gridId})` }} x="-480" y="-300" width="1440" height="900" />
        <line className="appy-pp-ground" x1="-400" y1="258.5" x2="880" y2="258.5" />

        {/* wall poster: sales-floor easter egg */}
        <g>
          <rect x="350" y="40" width="96" height="64" rx="4" className="appy-pp-poster-r" />
          <rect x="356" y="46" width="84" height="52" rx="2" className="appy-pp-poster-in" />
          <text x="398" y="68" className="appy-pp-poster-t">
            Always be
          </text>
          <text x="398" y="83" className="appy-pp-poster-t">
            enriching.
          </text>
          <path d="M378 90 h40" className="appy-pp-poster-u" />
        </g>

        {/* queue tray (left): real remaining count */}
        <g className="appy-pp-tray-pile" style={{ transform: `scaleY(${trayScale})` }}>
          <rect className="appy-pp-pile-r" style={stripes} x="50" y="190" width="72" height="60" rx="3" />
        </g>
        <rect className="appy-pp-tray-base" x="40" y="249" width="92" height="9" rx="3" />
        <text className="appy-pp-lbl" x="86" y="282">
          {trayLabel}
        </text>

        {/* crate (right): real enriched count, updated as each card lands */}
        <g className="appy-pp-crate-pile" style={{ transform: `scaleY(${crateScale})` }}>
          <rect className="appy-pp-pile-r" style={stripes} x="346" y="166" width="88" height="40" rx="3" />
        </g>
        <g className="appy-pp-flyers" ref={flyersRef} />
        <g className="appy-pp-crate-body" ref={crateBodyRef}>
          <rect className="appy-pp-crate-front" x="330" y="204" width="120" height="54" rx="8" />
          <text className="appy-pp-crate-count" x="390" y="236">
            {fmt(crateCount)}
          </text>
          <text className="appy-pp-crate-cap" x="390" y="250">
            enriched
          </text>
        </g>
        <g className="appy-pp-lid">
          <rect x="324" y="193" width="132" height="13" rx="5" />
        </g>
        <rect className="appy-pp-tape" x="384" y="193" width="12" height="30" rx="1.5" />
        <g className="appy-pp-stamp">
          <circle cx="446" cy="206" r="15" />
          <path d="M439 206.5l4.6 4.6 8.4-9" />
        </g>
        <text className="appy-pp-lbl" x="390" y="282">
          {packed ? trunc(folderName, 22) : 'Enriched'}
        </text>

        {/* robot SDR */}
        <ellipse className="appy-pp-b-shadow" cx="220" cy="259" rx="40" ry="5" />
        <g className="appy-pp-bot-bob">
          <rect className="appy-pp-b-body" x="203" y="226" width="12" height="28" rx="6" />
          <rect className="appy-pp-b-body" x="225" y="226" width="12" height="28" rx="6" />
          <rect className="appy-pp-b-body" x="197" y="249" width="22" height="9" rx="4.5" />
          <rect className="appy-pp-b-body" x="221" y="249" width="22" height="9" rx="4.5" />
          <rect className="appy-pp-b-body" x="186" y="166" width="68" height="66" rx="18" />
          <rect className="appy-pp-b-screen" x="204" y="184" width="32" height="20" rx="6" />
          <g>
            <rect className="appy-pp-b-vb" x="212" y="190" width="3.5" height="8" rx="1.75" />
            <rect className="appy-pp-b-vb" x="218.25" y="190" width="3.5" height="8" rx="1.75" />
            <rect className="appy-pp-b-vb" x="224.5" y="190" width="3.5" height="8" rx="1.75" />
          </g>
          <rect className="appy-pp-b-body" x="212" y="154" width="16" height="16" rx="4" />

          {/* arms by pose */}
          <g className="appy-pp-arm-l appy-pp-pose appy-pp-p-idle-l">
            <path className="appy-pp-b-limb" d="M190 182 L172 214" />
          </g>
          <g className="appy-pp-arm-r appy-pp-pose appy-pp-p-idle" ref={armRef}>
            <path className="appy-pp-b-limb" d="M250 182 L268 212" />
          </g>
          <g className="appy-pp-arm-r appy-pp-pose appy-pp-p-search">
            <path className="appy-pp-b-limb" d="M250 182 L276 160" />
            <path className="appy-pp-b-band" d="M277 159 L286 149" />
            <circle className="appy-pp-b-lens" cx="296" cy="138" r="14" />
            <path
              d="M289 132 q4 -4 9 -3"
              style={{ stroke: 'var(--pp-eye)', strokeWidth: 2, fill: 'none', strokeLinecap: 'round', opacity: 0.8 }}
            />
          </g>
          <g className="appy-pp-pose appy-pp-p-up">
            <path className="appy-pp-b-limb" d="M190 182 L168 150" />
            <path className="appy-pp-b-limb" d="M250 182 L272 150" />
          </g>
          <g className="appy-pp-pose appy-pp-p-mug">
            <path className="appy-pp-b-limb" d="M250 182 L262 206" />
            <path className="appy-pp-b-mug" d="M276 196 h3 a4.5 4.5 0 0 1 0 9 h-3" />
            <rect className="appy-pp-b-mug" x="258" y="190" width="18" height="21" rx="3" />
            <path className="appy-pp-b-steam" d="M263 184 q-3 -4 0 -8 q3 -4 0 -8" />
            <path className="appy-pp-b-steam appy-pp-s2" d="M270 184 q-3 -4 0 -8 q3 -4 0 -8" />
            <path className="appy-pp-b-steam appy-pp-s3" d="M266.5 180 q-3 -4 0 -8" />
          </g>

          {/* head */}
          <g className="appy-pp-head">
            <path className="appy-pp-b-band" d="M172 128 A48 48 0 0 1 268 128" />
            <line className="appy-pp-b-ant" x1="220" y1="92" x2="220" y2="70" />
            <circle className="appy-pp-b-accent appy-pp-bulb" cx="220" cy="65" r="6" ref={bulbRef} />
            <rect className="appy-pp-b-body" x="172" y="92" width="96" height="70" rx="24" />
            <rect className="appy-pp-b-screen" x="183" y="103" width="74" height="48" rx="16" />
            <g className="appy-pp-eyes appy-pp-eyes-n-w">
              <g className="appy-pp-eyes-n">
                <rect className="appy-pp-b-eye" x="201" y="115" width="11" height="17" rx="5.5" />
                <rect className="appy-pp-b-eye" x="228" y="115" width="11" height="17" rx="5.5" />
              </g>
            </g>
            <g className="appy-pp-eyes appy-pp-eyes-d">
              <circle className="appy-pp-b-eye" cx="207" cy="124" r="3.5" />
              <circle className="appy-pp-b-eye" cx="220" cy="124" r="3.5" />
              <circle className="appy-pp-b-eye" cx="233" cy="124" r="3.5" />
            </g>
            <g className="appy-pp-eyes appy-pp-eyes-h">
              <path className="appy-pp-b-eye-s" d="M200 127 q6 -9 12 0" />
              <path className="appy-pp-b-eye-s" d="M228 127 q6 -9 12 0" />
            </g>
            <g className="appy-pp-eyes appy-pp-eyes-s">
              <path className="appy-pp-b-eye-s" d="M201 125 h11" />
              <path className="appy-pp-b-eye-s" d="M228 125 h11" />
            </g>
            <path className="appy-pp-mouth appy-pp-m-smile appy-pp-b-eye-s" d="M211 140 Q220 146 229 140" style={{ strokeWidth: 3 }} />
            <ellipse className="appy-pp-mouth appy-pp-m-o appy-pp-b-eye" cx="220" cy="141" rx="5" ry="4" />
            <path className="appy-pp-mouth appy-pp-m-flat appy-pp-b-eye-s" d="M214 141 h12" style={{ strokeWidth: 3 }} />
            <rect className="appy-pp-b-cup" x="163" y="113" width="12" height="29" rx="6" />
            <rect className="appy-pp-b-cup" x="265" y="113" width="12" height="29" rx="6" />
            <path className="appy-pp-b-band-thin" d="M169 141 Q170 163 196 163" />
            <circle className="appy-pp-b-accent" cx="199" cy="163" r="4" />
          </g>
        </g>

        {/* speech bubble (re-keyed per line so it pops in) */}
        <g key={bubble} className="appy-pp-bubble appy-pp-pop">
          <path className="appy-pp-bubble-t" d="M136 64 L162 86 L150 64" />
          <rect className="appy-pp-bubble-r" x="28" y="30" width="148" height="36" rx="12" />
          <rect x="138" y="63" width="14" height="4" style={{ fill: 'var(--bg-surface)' }} />
          <text x="102" y="53">
            {bubble}
          </text>
        </g>

        {/* success burst */}
        <g className="appy-pp-burst" transform="translate(220 122)">
          <circle className="appy-pp-ring" r="44" />
          {[0, 45, 90, 135, 225, 270, 315].map((deg) => (
            <g key={deg} transform={`rotate(${deg})`}>
              {deg % 90 === 0 ? (
                <line className="appy-pp-spark" x1="0" y1="-60" x2="0" y2="-76" />
              ) : (
                <line className="appy-pp-spark appy-pp-alt" x1="0" y1="-62" x2="0" y2="-72" />
              )}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
});

/* ------------------------------------------------------------------------------------------------
 * Professional stage: signal field
 * ---------------------------------------------------------------------------------------------- */

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Up to 100 grid crossings (seeded shuffle of the 19x11 grid), sorted left to right. */
function fieldDots(n: number): [number, number][] {
  const r = mulberry32(11);
  const cells: [number, number][] = [];
  for (let c = 1; c <= 19; c++) for (let w = 1; w <= 11; w++) cells.push([c * 24, w * 24]);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, Math.max(0, Math.min(n, cells.length))).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

interface FieldStageProps {
  view: ViewPhase;
  found: number | null;
  done: number;
  rows: LeadRow[];
  reduced: boolean;
  nodesRef: React.Ref<SVGGElement>;
}

const FieldStage = React.memo(function FieldStage({ view, found, done, rows, reduced, nodesRef }: FieldStageProps) {
  const uid = React.useId();
  const gridId = svgId(uid, 'grid2');
  const scanId = svgId(uid, 'scan');
  const frontId = svgId(uid, 'front');
  const dots = React.useMemo(() => (found ? fieldDots(found) : []), [found]);
  const cur = dots.length ? dots[Math.min(done, dots.length - 1)] : null;
  const ripple = view === 'done' && !reduced;
  return (
    <div className="appy-pp-field-wrap" data-phase={view}>
      <svg className="appy-pp-scene appy-pp-field" viewBox="0 0 480 300" data-phase={view}>
        <defs>
          <pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse">
            <path className="appy-pp-g-line" d="M24 0H0V24" />
            <circle className="appy-pp-g-dot" cx="0" cy="0" r="1.3" />
            <circle className="appy-pp-g-dot" cx="24" cy="0" r="1.3" />
            <circle className="appy-pp-g-dot" cx="0" cy="24" r="1.3" />
            <circle className="appy-pp-g-dot" cx="24" cy="24" r="1.3" />
          </pattern>
          <linearGradient id={scanId} x1="0" x2="1">
            <stop offset="0" style={{ stopColor: 'var(--brand-500)', stopOpacity: 0 }} />
            <stop offset="1" style={{ stopColor: 'var(--brand-500)', stopOpacity: 0.07 }} />
          </linearGradient>
          <linearGradient id={frontId} x1="0" x2="1">
            <stop offset="0" style={{ stopColor: 'var(--brand-500)', stopOpacity: 0 }} />
            <stop offset="1" style={{ stopColor: 'var(--brand-500)', stopOpacity: 0.045 }} />
          </linearGradient>
        </defs>
        <rect x="-480" y="-300" width="1440" height="900" style={{ fill: `url(#${gridId})` }} />
        <g className="appy-pp-scan">
          <rect x="-180" y="-300" width="180" height="900" style={{ fill: `url(#${scanId})` }} />
          <line className="appy-pp-scan-edge" x1="0" y1="-300" x2="0" y2="600" />
        </g>
        <rect
          className="appy-pp-frontier-glow"
          x="-90"
          y="-300"
          width="90"
          height="900"
          style={{ fill: `url(#${frontId})`, transform: cur ? `translateX(${cur[0]}px)` : undefined }}
        />
        <line
          className="appy-pp-frontier"
          x1="0"
          y1="-300"
          x2="0"
          y2="600"
          style={{ transform: cur ? `translateX(${cur[0]}px)` : undefined }}
        />
        <g ref={nodesRef}>
          {dots.map(([x, y], i) => {
            const row = i < done ? rows[i] : undefined;
            const state = i < done ? (row && (row.email || row.phone) ? 'ok' : 'nc') : 'q';
            return (
              <circle
                key={`${x}-${y}`}
                cx={x}
                cy={y}
                r={4}
                className={cn(
                  'appy-pp-n',
                  state === 'ok' && 'appy-pp-ok',
                  state === 'nc' && 'appy-pp-nc',
                  state === 'q' && !ripple && 'appy-pp-pop',
                  ripple && 'appy-pp-rip'
                )}
                style={{
                  animationDelay: ripple ? `${Math.hypot(x - 240, y - 140) * 1.6}ms` : state === 'q' ? `${i * 7}ms` : undefined,
                }}
              />
            );
          })}
        </g>
        <g className="appy-pp-pingw" style={{ transform: cur ? `translate(${cur[0]}px, ${cur[1]}px)` : undefined }}>
          <circle className="appy-pp-ping" r="5" />
          <circle className="appy-pp-ping-core" r="3" />
        </g>
      </svg>
      <div className="appy-pp-legend">
        <span>
          <i style={{ background: 'var(--pp-dot-ok)' }} />
          Reachable
        </span>
        <span>
          <i style={{ background: 'var(--pp-dot-nc)' }} />
          No contact found
        </span>
        <span>
          <i style={{ border: '1.5px solid var(--pp-dot-q)' }} />
          Queued
        </span>
      </div>
      <div className="appy-pp-badge appy-pp-ok">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path className="appy-pp-draw" d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <div className="appy-pp-badge appy-pp-bad">
        <AlertTriangle />
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------------------------------------
 * Panel
 * ---------------------------------------------------------------------------------------------- */

function FeedRow({ row, k }: { row: LeadRow; k: number }) {
  const label = row.company ? `${row.company}${row.title ? ` · ${row.title}` : ''}` : `Decision-maker ${row.n}`;
  return (
    <div className={cn('appy-pp-row', k >= 3 && 'appy-pp-leaving')} style={{ transform: `translateY(${k * 36}px)` }}>
      <div className="appy-pp-row-in">
        <span className="appy-pp-idx">#{row.n}</span>
        <span className="appy-pp-co" aria-hidden>
          <Building2 />
        </span>
        <span className="appy-pp-nm" title={label}>
          {row.company ? (
            <>
              {row.company}
              {row.title && <em> · {row.title}</em>}
            </>
          ) : (
            label
          )}
        </span>
        <span className="appy-pp-tags">
          {row.email && (
            <span className="appy-pp-tag">
              <Mail aria-hidden />
              Email
            </span>
          )}
          {row.phone && (
            <span className="appy-pp-tag">
              <Phone aria-hidden />
              Phone
            </span>
          )}
          {!row.email && !row.phone && <span className="appy-pp-tag appy-pp-none">No contact found</span>}
        </span>
      </div>
    </div>
  );
}

export default function PullProgressPanel(props: PullProgressPanelProps) {
  const {
    phase,
    requested,
    found,
    totalMatching,
    searchComplete = true,
    done: rawDone,
    total,
    withEmail,
    withPhone,
    savedCount,
    folderName,
    error,
    failedPhase,
    startedAt,
    onDismiss,
    className,
    pullStyle = 'playful',
  } = props;
  const playful = pullStyle !== 'professional';
  const reduced = usePrefersReducedMotion();
  const done = total > 0 ? Math.min(rawDone, total) : rawDone;

  const view: ViewPhase = phase === 'searching' && found !== null ? 'found' : phase;
  const running = phase !== 'done' && phase !== 'error';
  const indeterminate = phase === 'connecting' || (phase === 'searching' && found === null);
  const foundEcho = useFoundEcho(phase, found, startedAt);
  const milestone = useMilestone(phase, done, total, startedAt);
  const rows = useLeadHistory(props);

  // Only a finished search that came back short is "N of M requested"; a batch in progress is not.
  const short = found !== null && searchComplete && found < requested;
  const ctx: CopyCtx = {
    found: found ?? 0,
    requested,
    short,
    totalMatching: totalMatching ?? 0,
    done,
    saved: savedCount ?? done,
    folder: folderName,
  };

  /* ---- crate count lands with each card (+600 ms); hero and stats stay the source of truth ---- */
  const [crateDone, setCrateDone] = React.useState(done);
  const crateCount = phase === 'done' ? savedCount ?? done : phase === 'saving' || reduced || !playful ? done : Math.min(crateDone, done);

  /* ---- imperative one-shot motion (WAAPI, card flights, dings): never per-frame React state ---- */
  const heroRef = React.useRef<HTMLDivElement>(null);
  const icMailRef = React.useRef<HTMLSpanElement>(null);
  const icPhoneRef = React.useRef<HTMLSpanElement>(null);
  const dingMailRef = React.useRef<HTMLSpanElement>(null);
  const dingPhoneRef = React.useRef<HTMLSpanElement>(null);
  const bulbRef = React.useRef<SVGCircleElement>(null);
  const armRef = React.useRef<SVGGElement>(null);
  const crateBodyRef = React.useRef<SVGGElement>(null);
  const flyersRef = React.useRef<SVGGElement>(null);
  const nodesRef = React.useRef<SVGGElement>(null);
  const timers = React.useRef(new Set<number>());
  const prev = React.useRef({ startedAt, done, withEmail, withPhone, found, milestone: milestone.reached });
  const lastDing = React.useRef({ e: 0, p: 0 });

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => window.clearTimeout(t));
      pending.clear();
    };
  }, []);

  const lastRow = rows[rows.length - 1];
  React.useEffect(() => {
    const p = prev.current;
    prev.current = { startedAt, done, withEmail, withPhone, found, milestone: milestone.reached };
    const later = (ms: number, fn: () => void) => {
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        fn();
      }, ms);
      timers.current.add(t);
    };
    if (p.startedAt !== startedAt || done < p.done) {
      flyersRef.current?.replaceChildren();
      later(0, () => setCrateDone(done));
      return;
    }
    const animate = !reduced;
    const pop = (el: Element | null, frames: Keyframe[], duration: number, easing = EASE_POP) => {
      if (animate && el && typeof el.animate === 'function') el.animate(frames, { duration, easing });
    };
    const ding = (host: HTMLSpanElement | null, key: 'e' | 'p', word: string) => {
      if (!animate || !playful || !host) return;
      const now = performance.now();
      if (now - lastDing.current[key] < 1100) return;
      lastDing.current[key] = now;
      const d = document.createElement('span');
      d.className = 'appy-pp-ding';
      d.textContent = word;
      host.appendChild(d);
      later(950, () => d.remove());
    };
    const iconPop: Keyframe[] = [{ transform: 'scale(1)' }, { transform: 'scale(1.35) rotate(-10deg)' }, { transform: 'scale(1)' }];
    if (withEmail > p.withEmail) {
      pop(icMailRef.current, iconPop, 360);
      ding(dingMailRef.current, 'e', 'ding!');
    }
    if (withPhone > p.withPhone) {
      pop(icPhoneRef.current, iconPop, 360);
      ding(dingPhoneRef.current, 'p', 'ring!');
    }
    if (playful && p.found === null && found !== null) {
      pop(bulbRef.current, [{ transform: 'scale(1)' }, { transform: 'scale(1.7)' }, { transform: 'scale(1)' }], 420);
    }
    if (milestone.reached > p.milestone) {
      pop(heroRef.current, [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], 340);
    }
    if (done > p.done) {
      if (playful) {
        if (animate) {
          pop(armRef.current, [{ transform: 'rotate(0)' }, { transform: 'rotate(-42deg)' }, { transform: 'rotate(0)' }], 300, EASE_OUT);
          const fl = flyersRef.current;
          if (fl && fl.childElementCount < 4) {
            const reach = Boolean(lastRow && (lastRow.email || lastRow.phone));
            const g = document.createElementNS(SVG_NS, 'g');
            g.setAttribute('transform', 'translate(258 192)');
            g.innerHTML =
              '<g class="appy-pp-fx"><g class="appy-pp-fy"><g class="appy-pp-fr">' +
              '<rect class="appy-pp-card-r" width="30" height="20" rx="4"/>' +
              '<line class="appy-pp-card-l" x1="6" y1="7" x2="18" y2="7"/>' +
              '<line class="appy-pp-card-l" x1="6" y1="13" x2="14" y2="13"/>' +
              `<circle class="appy-pp-card-d${reach ? '' : ' appy-pp-nc'}" cx="23.5" cy="10" r="3"/>` +
              '</g></g></g>';
            fl.appendChild(g);
            later(680, () => g.remove());
          }
          later(600, () => {
            setCrateDone((c) => Math.max(c, done));
            pop(crateBodyRef.current, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.96)' }, { transform: 'scaleY(1)' }], 220, 'ease');
          });
        } else {
          later(0, () => setCrateDone(done));
        }
      } else if (animate) {
        const nodes = nodesRef.current?.children;
        for (let i = p.done; i < done && nodes; i++) {
          pop(nodes[i] ?? null, [{ transform: 'scale(1)' }, { transform: 'scale(1.9)' }, { transform: 'scale(1)' }], 480, EASE_OUT);
        }
      }
    }
  }, [startedAt, done, withEmail, withPhone, found, milestone.reached, playful, reduced, lastRow]);

  /* ---- copy ---- */
  const quipLines = COPY.quips[view];
  const titleLines: Line[] = foundEcho
    ? [playful ? FOUND_FUN : FOUND_PRO]
    : playful
    ? view === 'done' || view === 'error'
      ? [quipLines[startedAt % quipLines.length]]
      : quipLines
    : [COPY.pro[view]];
  const rotateTitle = playful && !foundEcho && view !== 'done' && view !== 'error';

  const bubbleLines = COPY.bubble[view];
  const bubbleIdx = useRotation(bubbleLines.length, `${view}`, view === 'enriching' ? 2000 : 2400, playful);
  const bubble = milestone.show
    ? COPY.milestone[milestone.reached] ?? bubbleLines[0]
    : foundEcho
    ? COPY.bubble.found[0]
    : bubbleLines[bubbleIdx] ?? bubbleLines[0];

  /* ---- hero, bar, header note ---- */
  const enrichLike = (view === 'enriching' || view === 'saving' || view === 'error') && (found ?? 0) > 0;
  const heroValue = view === 'done' ? savedCount ?? done : enrichLike ? done : found ?? 0;
  const heroDim = heroValue === 0 && running;
  let metaStrong = '';
  let metaLabel = 'decision-makers found';
  if (view === 'done') {
    metaStrong = '100%';
    metaLabel = 'leads added';
  } else if (enrichLike) {
    metaStrong = `${pctOf(done, total)}%`;
    metaLabel = view === 'error' ? 'enriched before it stopped' : 'decision-makers enriched';
  } else if (view === 'found') {
    metaStrong = totalMatching !== null ? fmt(totalMatching) : '–';
    metaLabel = totalMatching !== null ? 'matching your filters' : 'total matching not given';
  }

  const pct = phase === 'saving' || phase === 'done' ? 100 : total > 0 ? Math.round((done / total) * 100) : 0;
  const barText = indeterminate ? COPY.eyebrow[view] : `${fmt(done)} of ${fmt(total)} contacts enriched`;

  let reqNote: React.ReactNode = null;
  if (running) {
    if (found === null || (!searchComplete && found < requested))
      reqNote = <span className="appy-pp-req">Pulling {fmt(requested)}</span>;
    else if (short)
      reqNote = (
        <span className="appy-pp-req appy-pp-capped" title="The data provider had no more matching leads">
          {fmt(found)} of {fmt(requested)} requested
        </span>
      );
  }

  /* ---- the only announced text: phase changes, milestones, done summary, error ---- */
  const srStatus =
    phase === 'connecting'
      ? 'Starting the pull.'
      : phase === 'searching'
      ? found === null
        ? 'Searching for decision-makers.'
        : `Found ${fmt(found)} decision-makers${totalMatching !== null ? ` out of ${fmt(totalMatching)} matching` : ''}.`
      : phase === 'enriching'
      ? milestone.reached
        ? `${fmt(milestone.at)} of ${fmt(total)} leads enriched.`
        : found !== null
        ? `Found ${fmt(found)} decision-makers${totalMatching !== null ? ` out of ${fmt(totalMatching)} matching` : ''}. Enriching contacts.`
        : 'Enriching contacts.'
      : phase === 'saving'
      ? `Saving to folder ${folderName}.`
      : phase === 'done'
      ? `Done. ${fmt(savedCount ?? done)} leads added to ${folderName}. ${fmt(withEmail)} verified emails, ${fmt(withPhone)} direct phones.`
      : `Pull failed. ${error || COPY.errorFallback}`;

  const feedRows = rows.slice(-4).reverse();
  const stoppedBeforeSave = failedPhase === 'connecting' || failedPhase === 'searching' || failedPhase === 'enriching';

  return (
    <section
      data-testid="pull-progress"
      data-phase={phase}
      data-style={playful ? 'playful' : 'professional'}
      role="status"
      aria-live="polite"
      aria-label="Lead pull progress"
      className={cn('appy-pp', indeterminate && 'appy-pp-indet', className)}
    >
      <style href="appy-pull-progress-keyframes" precedence="default">
        {STYLES}
      </style>
      <p className="sr-only">{srStatus}</p>

      <div className="appy-pp-pp-head" aria-live="off">
        <StepsHeader view={view} failedPhase={failedPhase} done={done} />
        <span className="appy-pp-clock tabular-nums">
          {reqNote}
          <Clock aria-hidden />
          <ClockText startedAt={startedAt} running={running} finished={phase === 'done'} />
        </span>
      </div>

      <div className="appy-pp-pp-body" aria-live="off">
        <div className="appy-pp-stage" aria-hidden>
          {playful ? (
            <BotStage
              view={view}
              wide={foundEcho}
              total={total}
              done={done}
              crateCount={crateCount}
              folderName={folderName}
              bubble={bubble}
              bulbRef={bulbRef}
              armRef={armRef}
              crateBodyRef={crateBodyRef}
              flyersRef={flyersRef}
            />
          ) : (
            <FieldStage view={view} found={found} done={done} rows={rows} reduced={reduced} nodesRef={nodesRef} />
          )}
        </div>

        <div className="appy-pp-info">
          <div className="appy-pp-eyebrow" data-testid="pull-progress-stage" data-stage={phase}>
            <span className="appy-pp-ld" aria-hidden />
            {COPY.eyebrow[view]}
          </div>
          <RotatingTitle lines={titleLines} ctx={ctx} rotateKey={`${pullStyle}:${view}:${foundEcho ? 'echo' : ''}`} enabled={rotateTitle} />

          <div className="appy-pp-hero">
            <div ref={heroRef} className={cn('appy-pp-hero-num', heroDim && 'appy-pp-dim')} aria-hidden>
              <Odometer value={heroValue} duration={view === 'found' ? 900 : 450} />
              <span className="appy-pp-hero-of tabular-nums" style={{ opacity: enrichLike ? 1 : 0 }}>
                / {fmt(total)}
              </span>
            </div>
            <div className="appy-pp-hero-meta">
              <b className="tabular-nums">{metaStrong}</b>
              {metaLabel}
            </div>
          </div>
          <div
            data-testid="pull-progress-bar"
            role="progressbar"
            aria-label="Contacts enriched"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={barText}
            className="appy-pp-bar"
          >
            <div className="appy-pp-bar-fill" style={{ transform: `translateX(${-(100 - pct)}%)` }}>
              <span className="appy-pp-bar-shine" />
            </div>
            <span className="appy-pp-bar-indet" />
          </div>

          <dl className="appy-pp-stats">
            <div className="appy-pp-stat">
              <dt>
                <span className="appy-pp-ic" aria-hidden>
                  <Users />
                </span>
                Found
              </dt>
              <dd>
                <Odometer value={found ?? 0} duration={900} />
                <small>{totalMatching ? `of ${fmt(totalMatching)}` : phase === 'error' ? '' : 'searching'}</small>
              </dd>
            </div>
            <div className={cn('appy-pp-stat', withEmail > 0 && 'appy-pp-lit')}>
              <dt>
                <span className="appy-pp-ic" ref={icMailRef} aria-hidden>
                  <Mail />
                </span>
                Verified emails
              </dt>
              <dd>
                <Odometer value={withEmail} testId="pull-progress-email-count" />
                <small>{done ? `${pctOf(withEmail, done)}%` : ''}</small>
              </dd>
              <span ref={dingMailRef} aria-hidden />
            </div>
            <div className={cn('appy-pp-stat', withPhone > 0 && 'appy-pp-lit')}>
              <dt>
                <span className="appy-pp-ic" ref={icPhoneRef} aria-hidden>
                  <Phone />
                </span>
                Direct phones
              </dt>
              <dd>
                <Odometer value={withPhone} testId="pull-progress-phone-count" />
                <small>{done ? `${pctOf(withPhone, done)}%` : ''}</small>
              </dd>
              <span ref={dingPhoneRef} aria-hidden />
            </div>
          </dl>

          {phase !== 'error' && (
            <div className="appy-pp-feedwrap">
              <div className="appy-pp-feed-h">
                <span>Latest enriched</span>
                <span className="tabular-nums">{done ? `${fmt(done)} of ${fmt(total)}` : ''}</span>
              </div>
              <div className="appy-pp-feed">
                {feedRows.length === 0 ? (
                  <div className="appy-pp-empty">{COPY.feedEmpty}</div>
                ) : (
                  feedRows.map((row, k) => <FeedRow key={row.n} row={row} k={k} />)
                )}
              </div>
              {phase === 'done' ? (
                <div className="appy-pp-actions appy-pp-ok" data-testid="pull-progress-done">
                  <span className="appy-pp-okdot" aria-hidden>
                    <Check />
                  </span>
                  <span>
                    Saved to <b>&ldquo;{folderName}&rdquo;</b>.
                  </span>
                </div>
              ) : (
                <SlowHint startedAt={startedAt} running={running} text={COPY.hint[playful ? 'playful' : 'professional']} />
              )}
            </div>
          )}

          {phase === 'error' && (
            <>
              <div className="appy-pp-errbox" data-testid="pull-progress-error">
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                <div>
                  <div>{error || COPY.errorFallback}</div>
                  <div className="mt-0.5 text-fg-secondary">{stoppedBeforeSave ? COPY.errorNothingUsed : COPY.errorCheckBalance}</div>
                </div>
              </div>
              <div className="appy-pp-actions appy-pp-bad">
                <span className="appy-pp-note">{COPY.errorRetry}</span>
                {onDismiss && (
                  <Button variant="ghost" size="sm" onClick={onDismiss} aria-label="Dismiss">
                    Dismiss
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Styles (ported 1:1 from the approved prototype; app role tokens only, prefix appy-pp-).
 * Every one-shot animation animates FROM a start state and rests at the final state, so with
 * animations removed (reduced motion) each element sits in its correct final pose.
 * ---------------------------------------------------------------------------------------------- */
const STYLES = `
.appy-pp{
  --ease-pop:cubic-bezier(.34,1.56,.64,1);
  --pp-stage:var(--bg-app);
  --pp-grid:rgb(12 10 9/.06);
  --pp-bot:var(--ink-900);
  --pp-bot-band:var(--ink-600);
  --pp-screen:#000;
  --pp-eye:var(--ai-highlight);
  --pp-card:var(--bg-surface);
  --pp-crate:var(--bg-surface);
  --pp-lid:var(--ink-800);
  --pp-dot-ok:var(--brand-600);
  --pp-dot-nc:var(--ink-400);
  --pp-dot-q:var(--ink-300);
  /* prototype aliases mapped to the app's role tokens */
  --fg:var(--text-primary);--fg2:var(--text-secondary);--fg3:var(--text-tertiary);--fg-dis:var(--text-disabled);
  --line:var(--border-default);--line-strong:var(--border-strong);
  --brand-action:var(--action-brand);--action:var(--action-primary);--action-fg:var(--action-primary-fg);
  --shadow-xs:0 1px 2px rgb(var(--shadow-color)/.05);--shadow-md:0 4px 16px rgb(var(--shadow-color)/.08);
}
@media screen{
  [data-theme="dark"] .appy-pp{
    --pp-grid:rgb(250 250 249/.055);--pp-bot:var(--ink-300);--pp-bot-band:var(--ink-500);--pp-screen:var(--ink-950);
    --pp-card:var(--ink-800);--pp-crate:var(--ink-800);--pp-lid:var(--ink-600);
    --pp-dot-ok:var(--brand-500);--pp-dot-nc:var(--ink-600);--pp-dot-q:var(--ink-700);
  }
}
/* ===================== PULL PROGRESS PANEL ===================== */
.appy-pp{background:var(--bg-surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow-xs);overflow:hidden;animation:appy-pp-enter 260ms var(--ease-out) both}
@keyframes appy-pp-enter{from{transform:translateY(8px);opacity:0}}
.appy-pp-pp-head{display:flex;align-items:center;justify-content:space-between;gap:16px;height:48px;padding:0 20px;border-bottom:1px solid var(--line)}
.appy-pp-steps{display:flex;align-items:center;gap:10px;list-style:none;margin:0;padding:0}
.appy-pp-steps li{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--fg3)}
.appy-pp-steps .appy-pp-dot{width:18px;height:18px;border-radius:999px;border:1.5px solid var(--line-strong);display:grid;place-items:center;transition:background-color .3s,border-color .3s}
.appy-pp-steps .appy-pp-dot svg{width:11px;height:11px;stroke-width:2.6;opacity:0;transform:scale(.4);transition:transform .35s var(--ease-pop),opacity .2s}
.appy-pp-steps li.appy-pp-active{color:var(--fg);font-weight:500}
.appy-pp-steps li.appy-pp-active .appy-pp-dot{border-color:var(--brand-action);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand-500) 18%,transparent)}
.appy-pp-steps li.appy-pp-active .appy-pp-dot::after{content:"";width:6px;height:6px;border-radius:9px;background:var(--brand-action);animation:appy-pp-soft 1.6s ease-in-out infinite}
.appy-pp-steps li.appy-pp-done{color:var(--fg2)}
.appy-pp-steps li.appy-pp-done .appy-pp-dot{background:var(--action);border-color:var(--action);color:var(--action-fg)}
.appy-pp-steps li.appy-pp-done .appy-pp-dot svg{opacity:1;transform:none}
.appy-pp-steps li.appy-pp-err .appy-pp-dot{border-color:var(--danger-fg)}
.appy-pp-steps li.appy-pp-err{color:var(--danger-fg);font-weight:500}
.appy-pp-steps .appy-pp-wire{position:relative;width:36px;height:1.5px;background:var(--line-strong);overflow:hidden;border-radius:2px}
.appy-pp-steps .appy-pp-wire.appy-pp-lit::after{content:"";position:absolute;top:0;left:0;width:14px;height:100%;background:linear-gradient(90deg,transparent,var(--brand-action));animation:appy-pp-travel 1.4s var(--ease-out) infinite}
.appy-pp-steps .appy-pp-wire.appy-pp-full{background:var(--action)}
@keyframes appy-pp-travel{from{transform:translateX(-14px)}to{transform:translateX(40px)}}
@keyframes appy-pp-soft{0%,100%{opacity:1}50%{opacity:.35}}
.appy-pp-clock{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--fg3)}
.appy-pp-clock svg{width:14px;height:14px}

.appy-pp-pp-body{display:grid;grid-template-columns:minmax(0,48fr) minmax(0,52fr)}
.appy-pp-stage{position:relative;margin:16px 0 16px 16px;border-radius:10px;border:1px solid var(--line);background:var(--pp-stage);overflow:hidden;min-height:300px;contain:paint;isolation:isolate}
.appy-pp-stage>div{position:absolute;inset:0}
.appy-pp-stage svg.appy-pp-scene{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:hidden}
.appy-pp-info{padding:18px 24px 18px 24px;display:flex;flex-direction:column;min-width:0;min-height:470px}

.appy-pp-eyebrow{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--fg2);font-weight:500}
.appy-pp-eyebrow .appy-pp-ld{width:8px;height:8px;border-radius:9px;background:var(--brand-action);animation:appy-pp-soft 1.6s ease-in-out infinite}
.appy-pp[data-phase=done] .appy-pp-eyebrow .appy-pp-ld{background:var(--success-500);animation:none}
.appy-pp[data-phase=error] .appy-pp-eyebrow .appy-pp-ld{background:var(--danger-fg);animation:none}
.appy-pp[data-phase=done] .appy-pp-eyebrow{color:var(--success-fg)}
.appy-pp[data-phase=error] .appy-pp-eyebrow{color:var(--danger-fg)}
.appy-pp-title{margin:6px 0 0;font-size:17px;line-height:24px;font-weight:600;color:var(--fg);min-height:48px;letter-spacing:-.005em}
.appy-pp-title span{display:inline-block}

.appy-pp-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:10px}
.appy-pp-hero-num{display:flex;align-items:baseline;gap:8px;font-size:40px;line-height:44px;font-weight:650;letter-spacing:-.02em;transform-origin:left bottom}
.appy-pp-hero-num.appy-pp-dim{color:var(--fg-dis)}
.appy-pp-hero-of{font-size:20px;font-weight:500;color:var(--fg3);letter-spacing:0;transition:opacity .25s}
.appy-pp-hero-meta{text-align:right;font-size:13px;color:var(--fg2);padding-bottom:4px}
.appy-pp-hero-meta b{display:block;font-size:15px;color:var(--fg);font-weight:600}

/* odometer */
.appy-pp-odo{display:inline-flex;font-variant-numeric:tabular-nums}
.appy-pp-os{display:inline-block;height:1.1em;line-height:1.1em;overflow:hidden;vertical-align:bottom}
.appy-pp-os:not(.appy-pp-comma){-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 13%,#000 87%,transparent 100%);mask-image:linear-gradient(to bottom,transparent 0,#000 13%,#000 87%,transparent 100%)}
.appy-pp-os.appy-pp-in{animation:appy-pp-odo-in 380ms var(--ease-out) both}
.appy-pp-oc{display:flex;flex-direction:column;will-change:transform}
.appy-pp-oc span{height:1.1em;display:block;text-align:center}
.appy-pp-os.appy-pp-comma{width:.28em}
@keyframes appy-pp-odo-in{from{transform:translateY(.4em);opacity:0}}

/* progress bar */
.appy-pp-bar{position:relative;height:6px;border-radius:99px;background:var(--bg-subtle);overflow:hidden;margin-top:12px}
.appy-pp-bar-fill{position:absolute;inset:0;border-radius:99px;background:var(--brand-action);transform:translateX(-100%);transition:transform 520ms var(--ease-out),background-color .4s;overflow:hidden;will-change:transform}
.appy-pp-bar-shine{position:absolute;top:0;bottom:0;left:0;width:30%;background:linear-gradient(90deg,transparent,rgb(255 255 255/.5),transparent);animation:appy-pp-shine 1.7s linear infinite}
.appy-pp[data-phase=done] .appy-pp-bar-fill{background:var(--success-500)}
.appy-pp[data-phase=error] .appy-pp-bar-fill{background:var(--danger-fg)}
.appy-pp[data-phase=done] .appy-pp-bar-shine,.appy-pp[data-phase=error] .appy-pp-bar-shine{display:none}
.appy-pp-bar-indet{position:absolute;top:0;bottom:0;left:0;width:26%;border-radius:99px;background:color-mix(in srgb,var(--brand-action) 70%,transparent);opacity:0;animation:appy-pp-indet 1.35s cubic-bezier(.45,0,.55,1) infinite}
.appy-pp.appy-pp-indet .appy-pp-bar-indet{opacity:1}
.appy-pp.appy-pp-indet .appy-pp-bar-fill{opacity:0}
@keyframes appy-pp-shine{from{transform:translateX(-100%)}to{transform:translateX(440%)}}
@keyframes appy-pp-indet{from{transform:translateX(-100%)}to{transform:translateX(390%)}}

/* stats */
.appy-pp-stats{display:grid;grid-template-columns:repeat(3,1fr);margin:18px 0 0;border:1px solid var(--line);border-radius:10px}
.appy-pp-stat{position:relative;padding:10px 14px;min-width:0}
.appy-pp-stat+.appy-pp-stat{border-left:1px solid var(--line)}
.appy-pp-stat dt{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:500;color:var(--fg2)}
.appy-pp-stat dt .appy-pp-ic{display:inline-flex;color:var(--fg3);transition:color .3s}
.appy-pp-stat dt .appy-pp-ic svg{width:14px;height:14px}
.appy-pp-stat.appy-pp-lit dt .appy-pp-ic{color:var(--fg)}
.appy-pp-stat dd{margin:4px 0 0;display:flex;align-items:baseline;gap:6px;white-space:nowrap}
.appy-pp-stat dd .appy-pp-odo{font-size:20px;line-height:24px;font-weight:600}
.appy-pp-stat dd small{font-size:12px;color:var(--fg3);overflow:hidden;text-overflow:ellipsis}
.appy-pp-ding{position:absolute;right:12px;top:8px;font-size:11px;font-weight:600;color:var(--success-fg);pointer-events:none;animation:appy-pp-ding 900ms var(--ease-out) both}
@keyframes appy-pp-ding{0%{transform:translateY(4px) scale(.8);opacity:0}20%{opacity:1;transform:translateY(0) scale(1)}100%{transform:translateY(-12px);opacity:0}}

/* live feed */
.appy-pp-feed-h{display:flex;justify-content:space-between;align-items:center;margin:16px 0 6px;font-size:12px;font-weight:500;color:var(--fg3)}
.appy-pp-feed{position:relative;height:108px;overflow:hidden}
.appy-pp-feed .appy-pp-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border:1px dashed var(--line-strong);border-radius:10px;font-size:13px;color:var(--fg3)}
.appy-pp-row{position:absolute;left:0;right:0;top:0;height:36px;transition:transform 340ms var(--ease-out),opacity 340ms var(--ease-out);will-change:transform}
.appy-pp-row.appy-pp-leaving{opacity:0}
.appy-pp-row-in{height:32px;display:flex;align-items:center;gap:10px;padding:0 10px;border-radius:8px;background:var(--bg-subtle);animation:appy-pp-row-in 360ms var(--ease-out) both}
.appy-pp-row:not(:first-child) .appy-pp-row-in{background:transparent}
.appy-pp-row-in.appy-pp-noanim{animation:none}
@keyframes appy-pp-row-in{from{transform:translateY(-14px) scale(.98);opacity:0}}
.appy-pp-row .appy-pp-idx{width:30px;font-size:12px;color:var(--fg3);font-variant-numeric:tabular-nums}
.appy-pp-row .appy-pp-co{width:22px;height:22px;border-radius:6px;background:var(--bg-surface);border:1px solid var(--line);display:grid;place-items:center;color:var(--fg2)}
.appy-pp-row .appy-pp-co svg{width:13px;height:13px}
.appy-pp-row .appy-pp-nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px}
.appy-pp-row .appy-pp-nm em{font-style:normal;color:var(--fg3)}
.appy-pp-tag{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 6px;border-radius:6px;font-size:12px;font-weight:500;background:var(--success-bg);color:var(--success-fg)}
.appy-pp-tag svg{width:12px;height:12px}
.appy-pp-tag.appy-pp-none{background:transparent;color:var(--fg3);font-weight:400}
.appy-pp-tags{display:flex;gap:4px}

.appy-pp-hint{display:flex;align-items:center;gap:6px;margin-top:10px;height:32px;font-size:12px;color:var(--fg3);opacity:0;transform:translateY(4px);transition:opacity .4s,transform .4s var(--ease-out)}
.appy-pp-hint.appy-pp-on{opacity:1;transform:none}
.appy-pp-hint svg{width:13px;height:13px}

.appy-pp-actions{display:none;margin-top:16px;gap:8px;align-items:center;flex-wrap:wrap}
.appy-pp[data-phase=done] .appy-pp-actions.appy-pp-ok,.appy-pp[data-phase=error] .appy-pp-actions.appy-pp-bad{display:flex;margin-top:12px}
.appy-pp[data-phase=error] .appy-pp-feedwrap{display:none}
.appy-pp[data-phase=done] .appy-pp-hint{display:none}
.appy-pp[data-phase=done] .appy-pp-actions.appy-pp-ok{margin-top:10px;height:32px}
.appy-pp-errbox{display:none;margin-top:14px;border:1px solid color-mix(in srgb,var(--danger-fg) 30%,transparent);background:var(--danger-bg);color:var(--danger-fg);border-radius:8px;padding:10px 12px;font-size:13px;gap:8px;align-items:flex-start}
.appy-pp-errbox svg{margin-top:2px}
.appy-pp[data-phase=error] .appy-pp-errbox{display:flex}
.appy-pp-actions .appy-pp-note{font-size:13px;color:var(--fg2);margin-right:auto}
.appy-pp-actions.appy-pp-ok{font-size:13px;color:var(--fg2)}
.appy-pp-actions.appy-pp-ok b{color:var(--fg);font-weight:600}
.appy-pp-okdot{width:20px;height:20px;border-radius:99px;background:var(--success-bg);color:var(--success-fg);display:grid;place-items:center}
.appy-pp-okdot svg{width:12px;height:12px;stroke-width:3}
.appy-pp[data-phase=done] .appy-pp-okdot{animation:appy-pp-pop-in 420ms var(--ease-pop) 200ms both}
.appy-pp-req{color:var(--fg2);font-weight:500;margin-right:10px}
.appy-pp-req.appy-pp-capped{color:var(--fg)}

/* ===================== PLAYFUL STAGE (robot SDR) ===================== */
.appy-pp-g-line{stroke:var(--pp-grid);stroke-width:1;fill:none}
.appy-pp-ground{stroke:var(--line-strong);stroke-width:1.5;stroke-dasharray:2 6;stroke-linecap:round}
.appy-pp-lbl{font-size:11px;fill:var(--fg3);text-anchor:middle;font-weight:500}
.appy-pp-pile-r{stroke:var(--line-strong);stroke-width:1}
.appy-pp-tray-base{fill:var(--bg-subtle);stroke:var(--line-strong);stroke-width:1.2}
.appy-pp-tray-pile,.appy-pp-crate-pile{transform-box:fill-box;transform-origin:50% 100%;transition:transform 520ms var(--ease-pop)}
.appy-pp-crate-pile{transition:transform 420ms var(--ease-out)}
.appy-pp-crate-front{fill:var(--pp-crate);stroke:var(--line-strong);stroke-width:1.5}
.appy-pp-crate-rim{stroke:var(--line-strong);stroke-width:1.2}
.appy-pp-crate-count{font-size:21px;font-weight:650;fill:var(--fg);text-anchor:middle;font-variant-numeric:tabular-nums}
.appy-pp-crate-cap{font-size:10px;fill:var(--fg3);text-anchor:middle;font-weight:500}
.appy-pp-crate-body{transform-box:fill-box;transform-origin:50% 100%}
.appy-pp-lid{opacity:0;transform-box:fill-box;transform-origin:0% 100%}
.appy-pp-lid rect{fill:var(--pp-lid)}
.appy-pp-tape{fill:var(--warning-400);opacity:0;transform-box:fill-box;transform-origin:50% 0%}
.appy-pp-stamp{opacity:0;transform-box:fill-box;transform-origin:center}
.appy-pp-stamp circle{fill:var(--success-500)}
.appy-pp-stamp path{stroke:#fff;stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round}
.appy-pp-scene[data-phase=saving] .appy-pp-lid,.appy-pp-scene[data-phase=done] .appy-pp-lid{opacity:1;animation:appy-pp-lid-in 620ms var(--ease-pop) both}
.appy-pp-scene[data-phase=saving] .appy-pp-tape,.appy-pp-scene[data-phase=done] .appy-pp-tape{opacity:.9;animation:appy-pp-tape-in 380ms var(--ease-out) 520ms both}
.appy-pp-scene[data-phase=done] .appy-pp-stamp{opacity:1;animation:appy-pp-stamp-in 560ms var(--ease-pop) 120ms both}
.appy-pp-scene[data-phase=saving] .appy-pp-crate-pile,.appy-pp-scene[data-phase=done] .appy-pp-crate-pile{transform:translateY(46px)!important}
@keyframes appy-pp-lid-in{from{transform:translateY(-64px) rotate(-18deg);opacity:0}50%{opacity:1}}
@keyframes appy-pp-tape-in{from{transform:scaleY(0)}}
@keyframes appy-pp-stamp-in{from{transform:scale(0) rotate(-40deg);opacity:0}60%{transform:scale(1.15) rotate(6deg);opacity:1}}

.appy-pp-b-body{fill:var(--pp-bot)}
.appy-pp-b-limb{stroke:var(--pp-bot);stroke-width:11;stroke-linecap:round;fill:none}
.appy-pp-b-screen{fill:var(--pp-screen)}

.appy-pp-b-eye{fill:var(--pp-eye)}
.appy-pp-b-eye-s{stroke:var(--pp-eye);stroke-width:3.5;stroke-linecap:round;fill:none}
.appy-pp-b-band{stroke:var(--pp-bot-band);stroke-width:5;fill:none;stroke-linecap:round}
.appy-pp-b-band-thin{stroke:var(--pp-bot-band);stroke-width:3;fill:none;stroke-linecap:round}
.appy-pp-b-cup{fill:var(--pp-bot-band)}
.appy-pp-b-accent{fill:var(--brand-500)}
.appy-pp-b-ant{stroke:var(--pp-bot);stroke-width:4;stroke-linecap:round}
.appy-pp-b-shadow{fill:#000;opacity:.14;transform-box:fill-box;transform-origin:center}
[data-theme="dark"] .appy-pp-b-shadow{opacity:.5}
.appy-pp-b-vb{fill:var(--pp-eye);transform-box:fill-box;transform-origin:center;transform:scaleY(.35)}
.appy-pp-b-lens{fill:color-mix(in srgb,var(--pp-eye) 16%,transparent);stroke:var(--pp-bot-band);stroke-width:4}
.appy-pp-b-mug{fill:var(--pp-card);stroke:var(--line-strong);stroke-width:1.5}
.appy-pp-b-steam{stroke:var(--fg3);stroke-width:2;fill:none;stroke-linecap:round;opacity:0}

.appy-pp-bot-bob{animation:appy-pp-bob 2.4s ease-in-out infinite}
.appy-pp-b-shadow{animation:appy-pp-shadow 2.4s ease-in-out infinite}
.appy-pp-eyes-n{transform-box:fill-box;transform-origin:center;animation:appy-pp-blink 4.2s infinite}
.appy-pp-bulb{transform-box:fill-box;transform-origin:center}
.appy-pp-head{transform-origin:220px 160px}
.appy-pp-arm-r{transform-origin:250px 182px}
.appy-pp-arm-l{transform-origin:190px 182px}

/* pose switching */
.appy-pp-pose{display:none}
.appy-pp-scene[data-pose=idle] .appy-pp-p-idle,.appy-pp-scene[data-pose=search] .appy-pp-p-search,.appy-pp-scene[data-pose=up] .appy-pp-p-up,.appy-pp-scene[data-pose=mug] .appy-pp-p-mug{display:inline}
.appy-pp-scene[data-pose=search] .appy-pp-p-idle-l,.appy-pp-scene[data-pose=idle] .appy-pp-p-idle-l,.appy-pp-scene[data-pose=mug] .appy-pp-p-idle-l{display:inline}
.appy-pp-eyes{display:none}
.appy-pp-scene[data-eyes=n] .appy-pp-eyes-n-w,.appy-pp-scene[data-eyes=wide] .appy-pp-eyes-n-w,.appy-pp-scene[data-eyes=dots] .appy-pp-eyes-d,.appy-pp-scene[data-eyes=happy] .appy-pp-eyes-h,.appy-pp-scene[data-eyes=sleepy] .appy-pp-eyes-s{display:inline}
.appy-pp-eyes-n-w{transform-box:fill-box;transform-origin:center}
.appy-pp-scene[data-eyes=wide] .appy-pp-eyes-n-w{transform:scale(1.2)}
.appy-pp-mouth{display:none}
.appy-pp-scene[data-eyes=n] .appy-pp-m-smile,.appy-pp-scene[data-eyes=dots] .appy-pp-m-smile,.appy-pp-scene[data-eyes=wide] .appy-pp-m-o,.appy-pp-scene[data-eyes=happy] .appy-pp-m-o,.appy-pp-scene[data-eyes=sleepy] .appy-pp-m-flat{display:inline}

/* per-phase loops */
.appy-pp-scene[data-phase=connecting] .appy-pp-bulb{animation:appy-pp-soft 1s ease-in-out infinite}
.appy-pp-eyes-d circle{transform-box:fill-box;transform-origin:center;animation:appy-pp-dotb 1.1s ease-in-out infinite}
.appy-pp-eyes-d circle:nth-child(2){animation-delay:.15s}.appy-pp-eyes-d circle:nth-child(3){animation-delay:.3s}
.appy-pp-scene[data-phase=searching] .appy-pp-p-search{animation:appy-pp-sweep 1.8s ease-in-out infinite}
.appy-pp-scene[data-phase=searching] .appy-pp-eyes-n-w{animation:appy-pp-look 1.8s ease-in-out infinite}
.appy-pp-scene[data-phase=searching] .appy-pp-head{animation:appy-pp-tilt 1.8s ease-in-out infinite}
.appy-pp-scene[data-phase=enriching] .appy-pp-b-vb{animation:appy-pp-talk .42s ease-in-out infinite}
.appy-pp-scene[data-phase=enriching] .appy-pp-b-vb:nth-child(2){animation-delay:-.14s}
.appy-pp-scene[data-phase=enriching] .appy-pp-b-vb:nth-child(3){animation-delay:-.28s}
.appy-pp-scene[data-phase=error] .appy-pp-bot-bob,.appy-pp-scene[data-phase=error] .appy-pp-b-shadow{animation:none}
.appy-pp-scene[data-phase=error] .appy-pp-bulb{fill:var(--ink-500)}
.appy-pp-scene[data-phase=error] .appy-pp-b-steam{animation:appy-pp-steam 2s ease-out infinite}
.appy-pp-scene[data-phase=error] .appy-pp-b-steam.appy-pp-s2{animation-delay:.7s}
.appy-pp-scene[data-phase=error] .appy-pp-b-steam.appy-pp-s3{animation-delay:1.3s}
.appy-pp-scene[data-phase=done] .appy-pp-bot-bob{animation:appy-pp-jump 900ms var(--ease-out) both, appy-pp-bob 2.4s ease-in-out 900ms infinite}
.appy-pp-scene[data-phase=saving] .appy-pp-bot-bob{animation:appy-pp-bob 1.2s ease-in-out infinite}

@keyframes appy-pp-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes appy-pp-shadow{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.88)}}
@keyframes appy-pp-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.12)}}
@keyframes appy-pp-dotb{0%,80%,100%{transform:translateY(0);opacity:.45}40%{transform:translateY(-4px);opacity:1}}
@keyframes appy-pp-sweep{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(11deg)}}
@keyframes appy-pp-look{0%,100%{transform:translateX(-3px)}50%{transform:translateX(4px)}}
@keyframes appy-pp-tilt{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(3deg)}}
@keyframes appy-pp-talk{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
@keyframes appy-pp-steam{0%{transform:translateY(4px);opacity:0}30%{opacity:.8}100%{transform:translateY(-14px);opacity:0}}
@keyframes appy-pp-jump{0%{transform:translateY(0)}28%{transform:translateY(-22px)}52%{transform:translateY(0)}70%{transform:translateY(-7px)}100%{transform:translateY(0)}}

.appy-pp-poster-r{fill:var(--pp-lid)}
.appy-pp-poster-in{fill:var(--pp-card)}
.appy-pp-poster-t{font-size:11px;font-weight:650;fill:var(--fg);text-anchor:middle;letter-spacing:-.01em}
.appy-pp-poster-u{stroke:var(--brand-500);stroke-width:2;stroke-linecap:round}
/* bubble */
.appy-pp-bubble{transform-box:fill-box;transform-origin:100% 100%;transition:opacity .2s}
.appy-pp-bubble.appy-pp-hide{opacity:0}
.appy-pp-bubble-r{fill:var(--bg-surface);stroke:var(--line-strong);stroke-width:1.2}
.appy-pp-bubble-t{fill:var(--bg-surface);stroke:var(--line-strong);stroke-width:1.2}
.appy-pp-bubble text{font-size:13px;font-weight:600;fill:var(--fg);text-anchor:middle}
.appy-pp-bubble.appy-pp-pop{animation:appy-pp-pop-in 300ms var(--ease-pop) both}
@keyframes appy-pp-pop-in{from{transform:scale(.6);opacity:0}}

/* flying cards */
.appy-pp-fx{animation:appy-pp-fly-x 640ms linear both}
.appy-pp-fy{animation:appy-pp-fly-y 640ms both}
.appy-pp-fr{transform-box:fill-box;transform-origin:center;animation:appy-pp-fly-r 640ms ease-in both}
.appy-pp-card-r{fill:var(--pp-card);stroke:var(--line-strong);stroke-width:1.2}
.appy-pp-card-l{stroke:var(--line-strong);stroke-width:2;stroke-linecap:round}
.appy-pp-card-d{fill:var(--pp-dot-ok)}
.appy-pp-card-d.appy-pp-nc{fill:var(--pp-dot-nc)}
@keyframes appy-pp-fly-x{to{transform:translateX(116px)}}
@keyframes appy-pp-fly-y{0%{transform:translateY(0);animation-timing-function:cubic-bezier(.25,.6,.45,1)}45%{transform:translateY(-74px);animation-timing-function:cubic-bezier(.55,0,.75,.45)}100%{transform:translateY(10px)}}
@keyframes appy-pp-fly-r{from{transform:rotate(0)}to{transform:rotate(-340deg)}}

/* burst */
.appy-pp-burst{opacity:0}
.appy-pp-scene[data-phase=done] .appy-pp-burst{opacity:1}
.appy-pp-spark{stroke:var(--brand-500);stroke-width:4;stroke-linecap:round;opacity:0}
.appy-pp-spark.appy-pp-alt{stroke:var(--pp-eye)}
:root:not([data-theme="dark"]) .appy-pp-spark.appy-pp-alt{stroke:var(--warning-400)}
.appy-pp-scene[data-phase=done] .appy-pp-spark{animation:appy-pp-spark 900ms var(--ease-out) 160ms both}
.appy-pp-ring{fill:none;stroke:var(--brand-500);stroke-width:2.5;opacity:0;transform-box:fill-box;transform-origin:center}
.appy-pp-scene[data-phase=done] .appy-pp-ring{animation:appy-pp-ring 800ms var(--ease-out) 150ms both}
@keyframes appy-pp-spark{0%{transform:translateY(14px);opacity:0}25%{opacity:1}70%{opacity:1}100%{transform:translateY(-16px);opacity:0}}
@keyframes appy-pp-ring{0%{transform:scale(.4);opacity:.6}100%{transform:scale(1.8);opacity:0}}

/* ===================== PROFESSIONAL STAGE (signal field) ===================== */
.appy-pp-field .appy-pp-scan{animation:appy-pp-scan 2.6s cubic-bezier(.45,0,.55,1) infinite;opacity:0}
.appy-pp-field[data-phase=searching] .appy-pp-scan,.appy-pp-field[data-phase=connecting] .appy-pp-scan{opacity:1}
.appy-pp-field[data-phase=connecting] .appy-pp-scan{animation-duration:3.6s;opacity:.5}
@keyframes appy-pp-scan{from{transform:translateX(-120px)}to{transform:translateX(780px)}}
.appy-pp-scan-edge{stroke:var(--brand-500);stroke-width:1.5;opacity:.5}
.appy-pp-g-dot{fill:var(--line-strong)}
.appy-pp-n{transform-box:fill-box;transform-origin:center;fill:var(--pp-stage);stroke:var(--pp-dot-q);stroke-width:1.5;transition:fill .35s,stroke .35s}
.appy-pp-n.appy-pp-pop{animation:appy-pp-n-pop 420ms var(--ease-pop) both}
.appy-pp-n.appy-pp-ok{fill:var(--pp-dot-ok);stroke:var(--pp-dot-ok)}
.appy-pp-n.appy-pp-nc{fill:var(--pp-dot-nc);stroke:var(--pp-dot-nc)}
.appy-pp-n.appy-pp-rip{animation:appy-pp-rip 620ms var(--ease-out) both}
@keyframes appy-pp-n-pop{from{transform:scale(0);opacity:0}}
@keyframes appy-pp-rip{0%,100%{transform:scale(1)}40%{transform:scale(1.9)}}
.appy-pp-field[data-phase=error] .appy-pp-n{opacity:.35}
.appy-pp-frontier{stroke:var(--brand-500);stroke-width:1;opacity:0;transition:transform 320ms var(--ease-out),opacity .3s}
.appy-pp-field[data-phase=enriching] .appy-pp-frontier{opacity:.45}
.appy-pp-field[data-phase=error] .appy-pp-frontier{opacity:.6;stroke:var(--danger-fg)}
.appy-pp-frontier-glow{opacity:0;transition:transform 320ms var(--ease-out),opacity .3s}
.appy-pp-field[data-phase=enriching] .appy-pp-frontier-glow{opacity:1}
.appy-pp-pingw{transition:transform 300ms var(--ease-out);opacity:0}
.appy-pp-field[data-phase=enriching] .appy-pp-pingw{opacity:1}
.appy-pp-ping{fill:none;stroke:var(--brand-500);stroke-width:1.5;transform-box:fill-box;transform-origin:center;animation:appy-pp-ping 900ms var(--ease-out) infinite}
.appy-pp-ping-core{fill:var(--brand-500)}
@keyframes appy-pp-ping{from{transform:scale(1);opacity:.8}to{transform:scale(3.4);opacity:0}}
.appy-pp-legend{position:absolute;left:12px;bottom:10px;display:flex;gap:12px;font-size:11px;color:var(--fg3);font-weight:500}
.appy-pp-legend span{display:inline-flex;align-items:center;gap:5px}
.appy-pp-legend i{width:8px;height:8px;border-radius:9px;display:inline-block}
.appy-pp-badge{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:999px;display:none;place-items:center;background:var(--bg-surface);border:1px solid var(--line);box-shadow:var(--shadow-md)}
.appy-pp-badge svg{width:30px;height:30px;stroke-width:2.4}
.appy-pp-badge.appy-pp-ok{color:var(--success-fg)}
.appy-pp-badge.appy-pp-bad{color:var(--danger-fg)}
.appy-pp-badge::before{content:"";position:absolute;inset:-1px;border-radius:999px;border:2px solid var(--success-500);opacity:0}
.appy-pp-field-wrap[data-phase=done] .appy-pp-badge.appy-pp-ok,.appy-pp-field-wrap[data-phase=error] .appy-pp-badge.appy-pp-bad{display:grid;animation:appy-pp-pop-in 420ms var(--ease-pop) both}
.appy-pp-field-wrap[data-phase=done] .appy-pp-badge.appy-pp-ok::before{animation:appy-pp-ring 900ms var(--ease-out) 200ms both}
.appy-pp-badge .appy-pp-draw{stroke-dasharray:22;animation:appy-pp-draw 420ms var(--ease-out) 260ms both}
@keyframes appy-pp-draw{from{stroke-dashoffset:22}}

/* ===================== reduced motion ===================== */
/* rotating title / quip swap (render the line keyed by its text) */
.appy-pp-title-swap{display:inline-block;animation:appy-pp-title 320ms var(--ease-out) both}
@keyframes appy-pp-title{from{opacity:0;transform:translateY(6px)}}

@media (prefers-reduced-motion: reduce){
  .appy-pp,.appy-pp *,.appy-pp *::before,.appy-pp *::after{animation:none!important;transition:none!important}
  .appy-pp-flyers,.appy-pp-burst,.appy-pp-ding,.appy-pp-pingw .appy-pp-ping,.appy-pp-field .appy-pp-scan{display:none}
  .appy-pp.appy-pp-indet .appy-pp-bar-indet{transform:none;width:100%;opacity:.5;background:repeating-linear-gradient(-45deg,color-mix(in srgb,var(--brand-action) 55%,transparent) 0 6px,transparent 6px 12px)}
}
/* app additions: list semantics for the step wires, error icon, narrow screens */
.appy-pp-steps li.appy-pp-wire-li{gap:0}
.appy-pp-errbox svg{width:16px;height:16px}
@media (max-width:767px){
  .appy-pp-pp-body{grid-template-columns:minmax(0,1fr)}
  .appy-pp-stage{margin:16px 16px 0;min-height:200px}
  .appy-pp-info{min-height:0}
  .appy-pp-pp-head{padding:0 14px}
  .appy-pp-steps{gap:6px}
  .appy-pp-steps .appy-pp-wire{width:16px}
  .appy-pp-req{display:none}
}
@media (max-width:359px){.appy-pp-stat dd small{display:none}}
`;
