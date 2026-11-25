'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { CopyViewerApp } from '@/components/agreements/CopyViewerApp';

function CopyRoute() {
  const params = useParams<{ token: string }>();
  return <CopyViewerApp token={String(params?.token ?? '')} />;
}

/** Public view-only page for a copy (CC) recipient of an Agreements document (no login; token checked on every request). */
export default function CopyViewPage() {
  return (
    <Suspense fallback={null}>
      <CopyRoute />
    </Suspense>
  );
}
