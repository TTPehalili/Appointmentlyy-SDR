import type { CSSProperties } from 'react';

/**
 * Animated backdrop for the sign-in pages: a faint grid with signal pulses travelling along
 * its lines, a slow scanning sweep, soft brand glows and a vignette.
 *
 * Render it as the first child of a `relative isolate` full-screen wrapper: it sits at
 * z-index -1, so the header, card and footer paint above it without any changes.
 * Pure CSS (the auth-bd section of globals.css), transform/opacity only, and still under
 * prefers-reduced-motion. All values are fixed, so server and client markup always match.
 *
 * Moving parts live in two lanes beside the card column (see the CSS for why); a horizontal
 * pulse is rendered in both lanes with the same timing, so it seems to pass behind the card.
 */

type Pulse = {
  axis: 'h' | 'v';
  /** Grid row (from the top) for horizontal pulses, column offset from the centre for vertical ones. */
  at: number;
  dur: number;
  delay: number;
  reverse?: boolean;
  lane: 'l' | 'r' | 'both';
  /** Phones get their own short list: one full-width lane, card covering the middle. */
  only?: 'desktop' | 'mobile';
};

const PULSES: Pulse[] = [
  // Desktop: rows level with the card, columns outside it.
  { axis: 'h', at: 8, dur: 12, delay: -2, lane: 'both', only: 'desktop' },
  { axis: 'h', at: 10, dur: 15, delay: -9, reverse: true, lane: 'both', only: 'desktop' },
  { axis: 'h', at: 12, dur: 13, delay: -5.5, lane: 'both', only: 'desktop' },
  { axis: 'v', at: -12, dur: 10, delay: -4, lane: 'l', only: 'desktop' },
  { axis: 'v', at: -7, dur: 14, delay: -10.5, reverse: true, lane: 'l', only: 'desktop' },
  { axis: 'v', at: 6, dur: 13, delay: -1, reverse: true, lane: 'r', only: 'desktop' },
  { axis: 'v', at: 11, dur: 11, delay: -7, lane: 'r', only: 'desktop' },
  // Phones: above and below the card.
  { axis: 'h', at: 3, dur: 11, delay: -2, lane: 'l', only: 'mobile' },
  { axis: 'h', at: 17, dur: 12, delay: -6.5, reverse: true, lane: 'l', only: 'mobile' },
  { axis: 'v', at: -3, dur: 14, delay: -11.5, lane: 'l', only: 'mobile' },
  { axis: 'v', at: 4, dur: 11, delay: -3.5, reverse: true, lane: 'l', only: 'mobile' },
];

function Lane({ side }: { side: 'l' | 'r' }) {
  return (
    <div className={`auth-bd-lane auth-bd-lane-${side}`}>
      <div className="auth-bd-glow-side" />
      <div className="auth-bd-scan">
        <div className="auth-bd-scan-grid" />
      </div>
      {PULSES.map((p, i) =>
        p.lane === side || p.lane === 'both' ? (
          <span
            key={i}
            className={[
              p.axis === 'h' ? 'auth-bd-pulse-h' : 'auth-bd-pulse-v',
              p.reverse ? 'auth-bd-reverse' : '',
              p.only ? `auth-bd-${p.only}-only` : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={
              {
                [p.axis === 'h' ? '--row' : '--col']: p.at,
                '--dur': `${p.dur}s`,
                '--delay': `${p.delay}s`,
              } as CSSProperties
            }
          />
        ) : null
      )}
    </div>
  );
}

export default function AuthBackdrop() {
  return (
    <div className="auth-bd" aria-hidden="true">
      {/* Static: painted with the page. */}
      <div className="auth-bd-glow-main" />
      <div className="auth-bd-field">
        <div className="auth-bd-grid" />
        <div className="auth-bd-nodes" />
      </div>
      <div className="auth-bd-vignette" />
      {/* Moving: beside the card column only. */}
      <Lane side="l" />
      <Lane side="r" />
    </div>
  );
}
