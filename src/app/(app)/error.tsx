'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui';

/** Friendly, inline error for any app screen (redesign spec 9): plain words and a retry. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div role="alert" className="flex max-w-md flex-col items-center gap-3 text-center">
        <AlertTriangle className="size-8 stroke-[1.5] text-line-strong" aria-hidden />
        <h1 className="text-h3 text-fg">This page couldn’t load</h1>
        <p className="text-body text-fg-secondary">
          Something went wrong on our side. Your data is safe. Try again, and if it keeps happening, contact support.
        </p>
        <div className="flex gap-2 pt-1">
          <Link
            href="/"
            className="focus-ring inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3.5 text-body font-medium text-fg hover:bg-subtle"
          >
            Go home
          </Link>
          <Button variant="primary" icon={<RotateCw />} onClick={() => retry()}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
