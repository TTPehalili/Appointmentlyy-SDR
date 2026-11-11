'use client';

import Link from 'next/link';
import { ClientOnly } from '@/components/shell/ClientOnly';
import { Skeleton } from '@/components/ui';
import UniversalCrmStudio from '@/components/admin/UniversalCrmStudio';

export default function Page() {
  return (
    <div className="px-4 py-6 md:px-8">
      {/* Live sending to CRMs, Zapier and Make is set up in Admin › Integrations. */}
      <div className="mb-4 rounded-md border border-line bg-subtle px-4 py-3 text-body text-fg-secondary" role="note" data-testid="crm-integrations-pointer">
        To send call outcomes, booked meetings and new contacts to your CRM, Zapier or Make, use{' '}
        <Link href="/admin/integrations" className="focus-ring rounded-sm font-medium text-fg underline underline-offset-2">
          Integrations
        </Link>
        .
      </div>
      {/* Browser-only, as before: this tool used to render only after an Admin tab click. */}
      <ClientOnly fallback={<Skeleton className="h-64 w-full" />}>
        <UniversalCrmStudio />
      </ClientOnly>
    </div>
  );
}
