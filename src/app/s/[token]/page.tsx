'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { SignerApp } from '@/components/agreements/SignerApp';

function SignerRoute() {
  const params = useParams<{ token: string }>();
  return <SignerApp token={String(params?.token ?? '')} />;
}

/** Public signer page for an Agreements link (no login; the token is checked on every request). */
export default function SignerPage() {
  return (
    <Suspense fallback={null}>
      <SignerRoute />
    </Suspense>
  );
}
