'use client';

import * as React from 'react';

import { Input, type InputProps } from '@/components/ui/input';
import { formatDateVN, parseDateVNtoISO } from '@/lib/format';

export interface DateInputProps
  extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  /** Giá trị dạng ISO `yyyy-mm-dd` (khớp với dữ liệu form/DB). */
  value?: string;
  /** Callback trả về giá trị ISO `yyyy-mm-dd`, hoặc `''` nếu chưa hợp lệ. */
  onChange?: (isoValue: string) => void;
}

/**
 * Ô nhập ngày dạng `dd/mm/yyyy` (toàn số) có mask tự động chèn dấu `/`.
 *
 * - Hiển thị cho người dùng: `dd/mm/yyyy`.
 * - Giá trị phát ra qua `onChange`: ISO `yyyy-mm-dd` (hoặc `''` khi chưa đủ/không hợp lệ).
 * - `value` truyền vào ở dạng ISO để đồng bộ với react-hook-form / DB.
 */
const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, onBlur, ...props }, ref) => {
    // Chuỗi hiển thị nội bộ (dd/mm/yyyy).
    const [display, setDisplay] = React.useState<string>(() =>
      formatDateVN(value),
    );

    // Đồng bộ khi `value` từ bên ngoài thay đổi (ví dụ mở form Sửa).
    React.useEffect(() => {
      const next = formatDateVN(value);
      setDisplay((prev) => {
        // Chỉ ghi đè nếu giá trị ISO tương ứng khác chuỗi đang gõ,
        // tránh giật con trỏ khi người dùng đang nhập.
        const prevIso = parseDateVNtoISO(prev);
        const valueIso = value ? value.split('T')[0] : '';
        return prevIso === valueIso ? prev : next;
      });
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Chỉ giữ chữ số, tối đa 8 (ddmmyyyy).
      const digits = e.target.value.replace(/\D/g, '').slice(0, 8);

      // Chèn dấu `/` theo mask dd/mm/yyyy.
      let masked = digits;
      if (digits.length > 4) {
        masked = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
      } else if (digits.length > 2) {
        masked = `${digits.slice(0, 2)}/${digits.slice(2)}`;
      }

      setDisplay(masked);
      onChange?.(parseDateVNtoISO(masked));
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        value={display}
        onChange={handleChange}
        onBlur={onBlur}
        {...props}
      />
    );
  },
);
DateInput.displayName = 'DateInput';

export { DateInput };
