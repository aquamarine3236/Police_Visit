import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading UI for the public registration page. Shown while the
 * server resolves scheduling settings. Mirrors the hero + form card so the
 * first paint has the right shape instead of a blank page.
 */
export default function PublicLoading() {
  return (
    <div className="flex-1 bg-soft-cloud px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Hero */}
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Skeleton className="h-7 w-52 rounded-full" />
          <Skeleton className="h-9 w-80 max-w-full" />
          <Skeleton className="h-5 w-full max-w-2xl" />
        </div>

        {/* Form card */}
        <div className="space-y-8 rounded-xl border border-hairline bg-surface p-6 shadow-sm sm:p-8 lg:p-10">
          {Array.from({ length: 2 }).map((_, section) => (
            <div key={section} className="space-y-6">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-64" />
                  <Skeleton className="h-4 w-48" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-11 w-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}
