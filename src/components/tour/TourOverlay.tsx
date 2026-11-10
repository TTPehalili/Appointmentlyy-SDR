'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { MOBILE_TAB_IDS, type TourStep } from './tourSteps';

/** Space between the spotlight and the card, the card and the screen edge, and the ring padding. */
const GAP = 14;
const EDGE = 12;
const PAD = 4;
const CARD_WIDTH = 352;
/** Same dim as the Dialog backdrop (bg-ink-950/40), a touch stronger so the ring reads. */
const SCRIM = 'color-mix(in srgb, var(--ink-950) 50%, transparent)';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Layout {
  spot: Box | null;
  card: { top: number; left: number };
  /** On a phone, the item sits in the More menu rather than the tab bar. */
  moreHint: boolean;
}

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** First visible element with this data-tour id (the sidebar and the phone tab bar can both have one). */
function findTarget(id: string | undefined): HTMLElement | null {
  if (!id) return null;
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth) {
      return el;
    }
  }
  return null;
}

/** Next to the spotlight: right, left, above, below; whichever fits first. Always inside the viewport. */
function placeCard(spot: Box | null, w: number, h: number): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampTop = (y: number) => Math.round(Math.min(Math.max(EDGE, y), Math.max(EDGE, vh - h - EDGE)));
  const clampLeft = (x: number) => Math.round(Math.min(Math.max(EDGE, x), Math.max(EDGE, vw - w - EDGE)));
  const centre = { top: clampTop((vh - h) / 2), left: clampLeft((vw - w) / 2) };
  if (!spot) return centre;
  const midY = spot.top + spot.height / 2 - h / 2;
  const midX = spot.left + spot.width / 2 - w / 2;
  if (spot.left + spot.width + GAP + w + EDGE <= vw) return { top: clampTop(midY), left: spot.left + spot.width + GAP };
  if (spot.left - GAP - w >= EDGE) return { top: clampTop(midY), left: spot.left - GAP - w };
  if (spot.top - GAP - h >= EDGE) return { top: spot.top - GAP - h, left: clampLeft(midX) };
  if (spot.top + spot.height + GAP + h + EDGE <= vh) return { top: spot.top + spot.height + GAP, left: clampLeft(midX) };
  return centre;
}

const sameLayout = (a: Layout | null, b: Layout) =>
  !!a &&
  a.moreHint === b.moreHint &&
  a.card.top === b.card.top &&
  a.card.left === b.card.left &&
  JSON.stringify(a.spot) === JSON.stringify(b.spot);

/**
 * The tour UI: a ring spotlight on the nav item (the rest of the screen dimmed) and a card next
 * to it. Steps without a visible target get a centred card. Focus is kept in the card; Esc skips,
 * ←/→ move between steps. Motion only when the person allows it.
 */
export default function TourOverlay({
  steps,
  onClose,
}: {
  steps: TourStep[];
  onClose: (how: 'finished' | 'skipped') => void;
}) {
  const [index, setIndex] = React.useState(0);
  const [layout, setLayout] = React.useState<Layout | null>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const primaryRef = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();
  const bodyId = React.useId();

  const step = steps[Math.min(index, steps.length - 1)];
  const isFirst = index === 0;
  const isLast = index >= steps.length - 1;

  const next = React.useCallback(() => setIndex((i) => Math.min(i + 1, steps.length - 1)), [steps.length]);
  const back = React.useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);
  const skip = React.useCallback(() => onClose('skipped'), [onClose]);
  const finish = React.useCallback(() => onClose('finished'), [onClose]);

  const measure = React.useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const el = findTarget(step.target);
    const r = el?.getBoundingClientRect();
    // Ring padding, kept on screen (a phone's edge tab would otherwise lose part of its ring).
    const ring = (lo: number, hi: number, max: number) => [Math.max(3, lo - PAD), Math.min(max - 3, hi + PAD)];
    const [x1, x2] = r ? ring(r.left, r.right, window.innerWidth) : [0, 0];
    const [y1, y2] = r ? ring(r.top, r.bottom, window.innerHeight) : [0, 0];
    const spot = r ? { top: Math.round(y1), left: Math.round(x1), width: Math.round(x2 - x1), height: Math.round(y2 - y1) } : null;
    const moreHint = !el && !!step.target && window.innerWidth < 768 && !MOBILE_TAB_IDS.includes(step.target);
    const nextLayout: Layout = { spot, card: placeCard(spot, card.offsetWidth, card.offsetHeight), moreHint };
    setLayout((prev) => (sameLayout(prev, nextLayout) ? prev : nextLayout));
  }, [step.target]);

  // New step: bring the item into view inside the (scrollable) sidebar, then place everything before paint.
  React.useLayoutEffect(() => {
    if (step.target) findTarget(step.target)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    measure();
  }, [step.target, measure]);

  // Follow the target on resize, scroll, sidebar collapse and card height changes.
  React.useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    document.addEventListener('transitionend', schedule, true);
    const ro = new ResizeObserver(schedule);
    if (cardRef.current) ro.observe(cardRef.current);
    const el = findTarget(step.target);
    if (el) ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      document.removeEventListener('transitionend', schedule, true);
      ro.disconnect();
    };
  }, [measure, step.target]);

  // Focus: into the card on open, back where it was on close; never outside while open.
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => primaryRef.current?.focus(), 0);
    const onFocusIn = (e: FocusEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) primaryRef.current?.focus();
    };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('focusin', onFocusIn);
      if (previous && previous.isConnected && previous !== document.body) previous.focus();
    };
  }, []);

  // A step change can remove the focused button (Back on step 1): keep focus in the card.
  React.useEffect(() => {
    if (cardRef.current && !cardRef.current.contains(document.activeElement)) primaryRef.current?.focus();
  }, [index]);

  // Keys, caught before the app's own shortcuts ([, ⌘K, ⌘J) so they can't act behind the tour.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        skip();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.key === 'Tab') {
        const items = [...(cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
        if (items.length === 0) return;
        e.preventDefault();
        const at = items.indexOf(document.activeElement as HTMLElement);
        const to = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at === items.length - 1 ? 0 : at + 1;
        items[to].focus();
      } else if ((e.metaKey || e.ctrlKey) && ['k', 'j'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [next, back, skip]);

  const spot = layout?.spot ?? null;
  const progress = Math.round(((index + 1) / steps.length) * 100);

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      {/* Blocks the page while the tour is open. Clicking it does nothing (no accidental skips). */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundColor: spot ? 'transparent' : SCRIM }}
        onMouseDown={(e) => e.preventDefault()}
      />
      {spot && (
        <div
          aria-hidden
          data-tour-spotlight
          className="pointer-events-none fixed rounded-lg motion-safe:transition-[top,left,width,height] motion-safe:duration-200 motion-safe:ease-out"
          style={{
            ...spot,
            boxShadow: `0 0 0 2px var(--brand-500), 0 0 0 6px color-mix(in srgb, var(--brand-500) 22%, transparent), 0 0 0 9999px ${SCRIM}`,
          }}
        />
      )}

      <div
        ref={cardRef}
        data-product-tour
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className={cn(
          'fixed flex flex-col rounded-xl border border-line bg-surface p-5 text-fg shadow-lg',
          'motion-safe:transition-[top,left] motion-safe:duration-200 motion-safe:ease-out',
          !layout && 'invisible',
        )}
        style={{
          top: layout?.card.top ?? 0,
          left: layout?.card.left ?? 0,
          width: `min(${CARD_WIDTH}px, calc(100vw - ${EDGE * 2}px))`,
        }}
      >
        <div className="flex items-center gap-3">
          <p className="shrink-0 text-caption text-fg-tertiary" data-numeric data-tour-counter>
            {index + 1} of {steps.length}
          </p>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-subtle" aria-hidden>
            <div
              className="h-full rounded-full bg-brand-500 motion-safe:transition-[width] motion-safe:duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* key: replays the fade on each step (no motion when reduced motion is on). */}
        <div key={step.id} className="motion-safe:animate-fade-in">
          <h2 id={titleId} className="mt-3 text-h3 text-fg">
            {step.title}
          </h2>
          <div id={bodyId}>
            <p className="mt-1.5 text-body text-fg-secondary">{step.body}</p>
            {step.why && <p className="mt-3 rounded-md bg-subtle px-3 py-2 text-small text-fg-secondary">{step.why}</p>}
            {layout?.moreHint && <p className="mt-2 text-small text-fg-tertiary">On your phone, tap More at the bottom right to find it.</p>}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          {!isLast && (
            <Button variant="ghost" size="sm" onClick={skip} className="-ml-2">
              Skip tour
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {!isFirst && (
              <Button variant="secondary" size="sm" onClick={back}>
                Back
              </Button>
            )}
            <Button ref={primaryRef} variant="brand" size="sm" onClick={isLast ? finish : next}>
              {isLast ? 'Get started' : 'Next'}
            </Button>
          </div>
        </div>

        {/* Focus stays on the buttons, so announce each new step. */}
        <p className="sr-only" aria-live="polite">
          {`Step ${index + 1} of ${steps.length}: ${step.title}.`}
        </p>
      </div>
    </div>,
    document.body,
  );
}
