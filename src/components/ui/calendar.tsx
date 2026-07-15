'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { vi } from 'react-day-picker/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

const MONTH_NAMES_VI = [
  'Tháng Một', 'Tháng Hai', 'Tháng Ba', 'Tháng Tư',
  'Tháng Năm', 'Tháng Sáu', 'Tháng Bảy', 'Tháng Tám',
  'Tháng Chín', 'Tháng Mười', 'Tháng Mười Một', 'Tháng Mười Hai',
];

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  locale: localeProp,
  startMonth: startMonthProp,
  endMonth: endMonthProp,
  ...props
}: CalendarProps) {
  const [month, setMonth] = React.useState<Date>(
    () => props.month ?? props.defaultMonth ?? new Date()
  );

  const canGoPrev = !startMonthProp ||
    month.getFullYear() > startMonthProp.getFullYear() ||
    (month.getFullYear() === startMonthProp.getFullYear() &&
      month.getMonth() > startMonthProp.getMonth());

  const canGoNext = !endMonthProp ||
    month.getFullYear() < endMonthProp.getFullYear() ||
    (month.getFullYear() === endMonthProp.getFullYear() &&
      month.getMonth() < endMonthProp.getMonth());

  const handlePrev = () => {
    if (!canGoPrev) return;
    setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  };

  const handleNext = () => {
    if (!canGoNext) return;
    setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  };

  const navBtnClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-canvas text-ink hover:bg-soft-cloud transition-colors focus-ring disabled:opacity-30 disabled:pointer-events-none';

  return (
    <div className={cn('p-3 flex flex-col items-center', className)}>
      {/* Custom navigation header */}
      <div className="flex w-full items-center justify-between mb-4 px-1">
        <button
          type="button"
          onClick={handlePrev}
          disabled={!canGoPrev}
          aria-label="Tháng trước"
          className={navBtnClass}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-body-strong font-semibold">
          {MONTH_NAMES_VI[month.getMonth()]} {month.getFullYear()}
        </span>
        <button
          type="button"
          onClick={handleNext}
          disabled={!canGoNext}
          aria-label="Tháng sau"
          className={navBtnClass}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <DayPicker
        showOutsideDays={showOutsideDays}
        locale={localeProp ?? vi}
        month={month}
        onMonthChange={setMonth}
        hideNavigation
        classNames={{
          months: 'flex flex-col sm:flex-row gap-4 sm:gap-8',
          month: 'flex flex-col gap-4',
          month_caption: 'hidden',
          caption_label: 'hidden',
          month_grid: 'w-full border-collapse',
          weekdays: 'flex',
          weekday: 'text-mute rounded-md w-9 text-caption-sm font-medium text-center',
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
          outside: 'day-outside text-mute/40 aria-selected:bg-soft-cloud/50 aria-selected:text-stone',
          disabled: 'text-stone opacity-50',
          range_middle: 'aria-selected:bg-soft-cloud aria-selected:text-ink',
          hidden: 'invisible',
          ...classNames,
        }}
        {...props}
      />
    </div>
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
