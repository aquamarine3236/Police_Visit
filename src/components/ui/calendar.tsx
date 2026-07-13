'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4 sm:gap-8',
        month: 'flex flex-col gap-4',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-body-strong',
        nav: 'flex items-center gap-1',
        button_previous:
          'absolute left-1 top-0 inline-flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-canvas text-ink hover:bg-soft-cloud transition-colors focus-ring',
        button_next:
          'absolute right-1 top-0 inline-flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-canvas text-ink hover:bg-soft-cloud transition-colors focus-ring',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday:
          'text-mute rounded-md w-9 text-caption-sm font-medium',
        week: 'flex w-full mt-2',
        day: cn(
          'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
          '[&:has([aria-selected])]:bg-soft-cloud',
          '[&:has([aria-selected].day-range-end)]:rounded-r-md',
          '[&:has([aria-selected].day-outside)]:bg-soft-cloud/50',
        ),
        day_button: cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-md text-caption-md transition-colors',
          'hover:bg-primary-soft hover:text-primary-deep focus-ring',
          'aria-selected:opacity-100',
        ),
        range_end: 'day-range-end',
        selected:
          'bg-primary text-on-primary hover:bg-primary hover:text-on-primary focus:bg-primary focus:text-on-primary rounded-md',
        today: 'bg-gold-soft text-gold font-bold',
        outside:
          'day-outside text-stone aria-selected:bg-soft-cloud/50 aria-selected:text-stone',
        disabled: 'text-stone opacity-50',
        range_middle:
          'aria-selected:bg-soft-cloud aria-selected:text-ink',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          if (orientation === 'left') {
            return <ChevronLeft className="h-4 w-4" />;
          }
          return <ChevronRight className="h-4 w-4" />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
