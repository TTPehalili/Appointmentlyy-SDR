'use client';

import { ClientOnly } from '@/components/shell/ClientOnly';
import { Skeleton } from '@/components/ui';
import UniversalCrmStudio from '@/components/admin/UniversalCrmStudio';

export default function Page() {
  return (
    <div className="px-4 py-6 md:px-8">
      {/* Browser-only, as before: this tool used to render only after an Admin tab click. */}
      <ClientOnly fallback={<Skeleton className="h-64 w-full" />}>
        <UniversalCrmStudio />
      </ClientOnly>
    </div>
  );
}
