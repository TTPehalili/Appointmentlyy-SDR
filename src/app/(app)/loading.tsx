import { Skeleton } from '@/components/ui';

/** Layout-shaped skeleton while a screen loads (redesign spec 9: never a full-page spinner). */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6 px-4 py-6 md:px-8" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-lg" />
    </div>
  );
}
