'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Skeleton } from '@/components/ui';
import MeetingPlanView from '@/components/meetings/MeetingPlanView';

function PlanRoute() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';
  // A new id remounts the view, so nothing from the previous plan carries over.
  return <MeetingPlanView key={id} id={id} />;
}

/** One meeting plan: Action Plan for the AE and the customer one-pager. */
export default function MeetingPlanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 px-4 py-6 md:px-8">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <PlanRoute />
    </Suspense>
  );
}
