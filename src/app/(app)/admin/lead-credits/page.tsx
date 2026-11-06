'use client';

import { ClientOnly } from '@/components/shell/ClientOnly';
import { PageHeader, Skeleton } from '@/components/ui';
import LeadCreditsAdmin from '@/components/icp/LeadCreditsAdmin';

export default function Page() {
  return (
    <div className="px-4 py-6 md:px-8">
      <PageHeader
        title="Lead credits & quota"
        description="Lead Finder allowance, top-ups and workspace credits."
      />
      {/* Browser-only: quota and invoices live in local storage. */}
      <ClientOnly fallback={<Skeleton className="h-64 w-full" />}>
        <LeadCreditsAdmin />
      </ClientOnly>
    </div>
  );
}
