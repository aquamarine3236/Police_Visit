import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading UI for the inmates screen. Rendered instantly during
 * navigation so switching to this tab never shows a blank frame. Mirrors the
 * header (with action buttons), the filter row and the data table.
 */
export default function InmatesLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 w-full md:w-64" />
        <Skeleton className="h-11 w-full md:w-64" />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-sm">
        <div className="flex items-center gap-4 border-b border-hairline px-4 py-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-hairline-soft px-4 py-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
