'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs } from '@/components/ui';
import SparringArena from '@/components/practice/SparringArena';
import MockDialerSetup from '@/components/practice/MockDialerSetup';

/** /practice?tab=sparring|dialer. Sparring sessions (classic arena) is the default tab. */
function PracticeTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get('tab') === 'dialer' ? 'dialer' : 'sparring';
  const tabs = (
    <Tabs
      label="Practice"
      value={tab}
      onChange={(v) => router.replace(`${pathname}?tab=${v}`, { scroll: false })}
      items={[
        { value: 'sparring', label: 'Sparring sessions' },
        { value: 'dialer', label: 'Mock dialer' },
      ]}
    />
  );
  return tab === 'dialer' ? <MockDialerSetup tabs={tabs} /> : <SparringArena tabs={tabs} />;
}

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-small text-fg-secondary">Loading Practice…</div>}>
      <PracticeTabs />
    </Suspense>
  );
}
