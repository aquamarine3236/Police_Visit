'use client';

import * as React from 'react';
import { CalendarDays } from 'lucide-react';

import { DateInput } from '@/components/ui/date-input';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface DatePickerProps {
  /** Giá trị dạng ISO `yyyy-mm-dd`. */
  value?: string;
  /** Callback trả về ISO `yyyy-mm-dd`, hoặc `''` nếu xóa/không hợp lệ. */
  onChange?: (isoValue: string) => void;
  /** Không cho chọn ngày TRƯỚC ngày này (ISO `yyyy-mm-dd`). */
  disabledBefore?: string;
  placeholder?: string;
  'aria-label'?: string;
  className?: string;
  /** Class cho ô nhập bên trong (đồng bộ chiều cao với các input khác). */
  inputClassName?: string;
  /** Canh lề panel lịch so với ô nhập (tránh tràn khỏi màn hình). */
  align?: 'start' | 'end';
}

/** Chuyển ISO `yyyy-mm-dd` sang `Date` local (tránh lệch múi giờ). */
function isoToDate(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return undefined;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/** Chuyển `Date` sang ISO `yyyy-mm-dd` (theo ngày local). */
function dateToISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Ô chọn ngày kết hợp: cho phép GÕ TAY (định dạng dd/mm/yyyy) và CHỌN TỪ LỊCH.
 *
 * - Hiển thị dd/mm/yyyy; giá trị phát ra qua `onChange` là ISO `yyyy-mm-dd`.
 * - Bấm icon lịch để mở panel `Calendar`; chọn ngày sẽ điền và đóng panel.
 * - `disabledBefore` vô hiệu hóa các ngày trước ngưỡng trong lịch.
 */
const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(
  (
    {
      value,
      onChange,
      disabledBefore,
      placeholder = 'dd/mm/yyyy',
      className,
      inputClassName,
      align = 'start',
      ...props
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);

    const selectedDate = isoToDate(value);
    const beforeDate = isoToDate(disabledBefore);

    // react-day-picker (single mode) trả về `undefined` khi bấm lại đúng ngày
    // đang chọn -> coi như BỎ CHỌN, phát ra chuỗi rỗng.
    const handleSelect = (date: Date | undefined) => {
      onChange?.(date ? dateToISO(date) : '');
      setOpen(false);
    };

    return (
      <Popover open={open} onOpenChange={setOpen} className={className}>
        <PopoverTrigger>
          <div className="relative">
            <DateInput
              ref={ref}
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              className={cn('pr-10', inputClassName)}
              aria-label={props['aria-label']}
            />
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              aria-label="Mở lịch chọn ngày"
              className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-mute transition-colors hover:bg-soft-cloud hover:text-ink focus-ring"
            >
              <CalendarDays className="h-4 w-4" />
            </button>
          </div>
        </PopoverTrigger>
        <PopoverContent align={align}>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            defaultMonth={selectedDate ?? beforeDate}
            disabled={beforeDate ? { before: beforeDate } : undefined}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    );
  },
);
DatePicker.displayName = 'DatePicker';

export { DatePicker };
