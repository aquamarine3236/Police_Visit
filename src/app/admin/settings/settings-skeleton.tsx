import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading placeholder for the scheduling-settings screen. Mirrors the real
 * layout (title, a 7/5 two-column grid with the form on the left and the slot
 * preview on the right) so the transition into the loaded form is seamless
 * instead of a centered spinner that shifts everything once data arrives.
 */
export function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Form card */}
        <div className="space-y-6 rounded-lg border border-hairline bg-surface p-6 shadow-sm lg:col-span-7">
          {/* Days selector */}
          <div className="space-y-3">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-4 w-48" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-20" />
              ))}
            </div>
          </div>

          {/* Time inputs grid */}
          <div className="grid grid-cols-1 gap-4 border-t border-hairline-soft pt-6 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-11 w-full" />
              </div>
            ))}
          </div>

          {/* Submit button */}
          <div className="border-t border-hairline-soft pt-6">
            <Skeleton className="h-11 w-40" />
          </div>
        </div>

        {/* Preview card */}
        <div className="space-y-4 rounded-lg border border-hairline bg-surface p-6 shadow-sm lg:col-span-5">
          <Skeleton className="h-5 w-48" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
