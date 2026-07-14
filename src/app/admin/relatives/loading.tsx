import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading UI for the relatives (thân thích) screen. Rendered
 * instantly during navigation so switching to this tab never shows a blank
 * frame.
 */
export default function RelativesLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Search bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 w-32" />
      </div>

      {/* Inmate info card placeholder */}
      <Skeleton className="h-40 w-full rounded-lg" />

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-sm">
        <div className="flex items-center gap-4 border-b border-hairline px-4 py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-hairline-soft px-4 py-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="ml-auto h-8 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
