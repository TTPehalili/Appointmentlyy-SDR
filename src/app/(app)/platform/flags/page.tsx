'use client';

import { FEATURE_FLAGS } from '@/lib/featureFlags';
import { Card, PageHeader, StatusDot } from '@/components/ui';

const DESCRIPTIONS: Record<string, string> = {
  coaching: 'Coaching view for managers: sparring scores and call reviews.',
  jobSignals: 'Job signals tab inside Lead Finder.',
};

/**
 * Read-only view of UI feature flags.
 * DESIGN-NOTE: flags are compile-time constants in src/lib/featureFlags.ts. Make them
 * editable here once they move to a per-tenant store.
 */
export default function FeatureFlagsPage() {
  return (
    <div className="max-w-[880px] px-4 py-6 md:px-8">
      <PageHeader title="Feature flags" description="Which in-progress surfaces are visible in the app." />
      <Card className="divide-y divide-line">
        {Object.entries(FEATURE_FLAGS).map(([key, on]) => (
          <div key={key} className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="font-mono text-small text-fg">{key}</p>
              <p className="mt-0.5 text-small text-fg-secondary">{DESCRIPTIONS[key] ?? ''}</p>
            </div>
            <StatusDot tone={on ? 'success' : 'neutral'} label={on ? 'On' : 'Off'} />
          </div>
        ))}
      </Card>
    </div>
  );
}
