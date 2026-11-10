/**
 * Product tour: the "start" signal and the per-person "done" flag.
 *
 * The flag lives in localStorage as `appy_tour_done:<email>`, so it is remembered per person and
 * per device. It deliberately does not start with `tenant_` and is not in the wipe lists of
 * src/lib/tenantStorage.ts: switching workspace or signing out never replays the tour.
 */

export const TOUR_START_EVENT = 'appy:start-tour';

const DONE_PREFIX = 'appy_tour_done:';

export function tourDoneKey(email: string): string {
  return DONE_PREFIX + email.trim().toLowerCase();
}

export function isTourDone(email: string): boolean {
  try {
    return localStorage.getItem(tourDoneKey(email)) !== null;
  } catch {
    // Storage unavailable (private mode): don't nag on every page load.
    return true;
  }
}

export function markTourDone(email: string, how: 'finished' | 'skipped') {
  try {
    localStorage.setItem(tourDoneKey(email), JSON.stringify({ v: 1, how, at: new Date().toISOString() }));
  } catch {
    // nothing to remember it in
  }
}

/** Open the product tour from anywhere (Settings, ⌘K). Safe to call before the tour has loaded. */
export function startTour() {
  if (typeof window === 'undefined') return;
  // Next tick, so a closing menu or dialog (⌘K) can hand focus back first.
  window.setTimeout(() => window.dispatchEvent(new Event(TOUR_START_EVENT)), 0);
}
