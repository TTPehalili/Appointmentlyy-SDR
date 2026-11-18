'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { PublicBoard } from '@/components/clientProjects/PublicBoard';

function BoardRoute() {
  const params = useParams<{ token: string }>();
  return <PublicBoard token={String(params?.token ?? '')} />;
}

/** Shared client board for a Client Project (no login; the link token is checked on every request). */
export default function BoardPage() {
  return (
    <Suspense fallback={null}>
      <BoardRoute />
    </Suspense>
  );
}
