import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading UI for the admin dashboard. Shown instantly by Next.js
 * during navigation (before the client page mounts and fetches data), so the
 * screen never flashes blank. Mirrors the dashboard's header + filters + table.
 */
export default function AdminDashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-10 w-44" />
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 border-b border-hairline pb-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 w-40" />
        <Skeleton className="h-11 w-40" />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-sm">
        <div className="space-y-0">
          {/* Header row */}
          <div className="flex items-center gap-4 border-b border-hairline px-4 py-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
          {/* Body rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-hairline-soft px-4 py-4">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
