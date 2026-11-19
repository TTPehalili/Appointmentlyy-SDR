'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { GuidedOnboarding } from '@/components/clientProjects/intake/GuidedOnboarding';

function OnboardingRoute() {
  const params = useParams<{ token: string }>();
  return <GuidedOnboarding token={String(params?.token ?? '')} />;
}

/**
 * Guided onboarding for a Client Project's shared board: one item per page, in milestone order (?step=<requestId>&part=<n>).
 * No login: the board link token is checked on every request. The /b layout and headers apply (noindex, no referrer, no-store).
 */
export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingRoute />
    </Suspense>
  );
}
