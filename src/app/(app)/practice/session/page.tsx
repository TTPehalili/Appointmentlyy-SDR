'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import BorisCallingCockpit from '@/components/BorisCallingCockpit';
import { EmptyState, buttonClasses } from '@/components/ui';
import { parsePracticeSetup } from '@/lib/practice';

/** /practice/session?persona=<id>&objection=<rebuttalId>&difficulty=<friendly|realistic|tough> */
function PracticeSession() {
  const params = useSearchParams();
  const setup = parsePracticeSetup(params);
  if (!setup) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          icon={<GraduationCap />}
          title="Choose a buyer to practise with"
          description="This practice link is missing a buyer persona."
          action={
            <Link href="/practice" className={buttonClasses('primary', 'sm')}>
              Go to Practice
            </Link>
          }
        />
      </div>
    );
  }
  // A new setup (e.g. another persona) starts a fresh practice Dialer.
  return <BorisCallingCockpit key={`${setup.personaId}|${setup.objectionId}|${setup.difficulty}`} practice={setup} />;
}

export default function PracticeSessionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-small text-fg-secondary">Loading practice call…</div>}>
      <PracticeSession />
    </Suspense>
  );
}
