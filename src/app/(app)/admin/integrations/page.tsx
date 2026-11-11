'use client';

import { ClientOnly } from '@/components/shell/ClientOnly';
import { Skeleton } from '@/components/ui';
import IntegrationsHub from '@/components/integrations/IntegrationsHub';

/** Admin › Integrations › Integrations: webhooks, delivery log, CRM connections (Admin+). */
export default function Page() {
  return (
    <ClientOnly
      fallback={
        <div className="flex flex-col gap-3 px-4 py-6 md:px-8">
          <Skeleton className="h-8 w-1/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="mt-6 h-40 w-full" />
        </div>
      }
    >
      <IntegrationsHub />
    </ClientOnly>
  );
}
