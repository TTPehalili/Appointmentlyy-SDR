/**
 * Feature flags for UI surfaces that are built in later redesign phases.
 * Nav items with a featureFlag are hidden while the flag is off.
 */
export const FEATURE_FLAGS = {
  /** Coaching view (sparring scores + call reviews). Built in a later phase. */
  coaching: false,
  /** Job signals tab inside Lead Finder. */
  jobSignals: true,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}
