'use client';

import { ClientOnly } from '@/components/shell/ClientOnly';
import { PageHeader, Skeleton } from '@/components/ui';
import { PhoneSystemAdmin } from '@/components/telephony/PhoneSystemAdmin';

export default function Page() {
  return (
    <div className="max-w-[880px] px-4 py-6 md:px-8">
      <PageHeader
        title="Phone system"
        description="Connect VICIdial so reps can call straight from the Dialer."
      />
      {/* Browser-only: outcome codes and the test agent live in local storage. */}
      <ClientOnly fallback={<Skeleton className="h-64 w-full" />}>
        <PhoneSystemAdmin />
      </ClientOnly>
    </div>
  );
}
