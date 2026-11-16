'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { AgreementDetail } from '@/components/agreements/AgreementDetail';

function DetailRoute() {
  const params = useParams<{ id: string }>();
  return <AgreementDetail id={String(params?.id ?? '')} />;
}

/** Platform Console › Agreements › one document. */
export default function AgreementDetailPage() {
  return (
    <Suspense fallback={null}>
      <DetailRoute />
    </Suspense>
  );
}
