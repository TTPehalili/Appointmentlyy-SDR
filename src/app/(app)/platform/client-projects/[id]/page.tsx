'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ProjectDetail } from '@/components/clientProjects/ProjectDetail';

function DetailRoute() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  return <ProjectDetail id={String(params?.id ?? '')} initialTab={search?.get('tab') ?? undefined} />;
}

/** Platform Console › Client Projects › one project. */
export default function ClientProjectPage() {
  return (
    <Suspense fallback={null}>
      <DetailRoute />
    </Suspense>
  );
}
