import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { TableBody, TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface TableSkeletonProps {
  /** Number of skeleton rows to render. */
  rows?: number;
  /**
   * Column layout. Each entry describes one column's placeholder. `width`
   * accepts any Tailwind width utility; `align` mirrors the real cell
   * alignment so the shimmer sits exactly where the content will be.
   */
  columns: {
    width: string;
    align?: 'left' | 'right' | 'center';
  }[];
}

/**
 * Renders skeleton rows that mirror a real data table's column layout. Used as
 * the initial-load placeholder so the table keeps its shape instead of
 * collapsing to a single centered spinner (which causes a visible layout jump
 * once data arrives).
 */
export function TableSkeleton({ rows = 8, columns }: TableSkeletonProps) {
  return (
    <TableBody>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={rowIndex} className="hover:bg-transparent">
          {columns.map((col, colIndex) => (
            <TableCell key={colIndex}>
              <Skeleton
                className={cn(
                  'h-4',
                  col.width,
                  col.align === 'right' && 'ml-auto',
                  col.align === 'center' && 'mx-auto',
                )}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}
