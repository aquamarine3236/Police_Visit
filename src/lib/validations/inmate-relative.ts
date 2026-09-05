import { z } from 'zod';

import { isPastDateVN } from '@/lib/time';

// ─── Vietnamese name regex (letters, spaces, Vietnamese diacritics) ─────────
// Giữ đồng bộ với inmate.ts / registration.ts.
const vietnameseNameRegex =
  /^[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂưăạảấầẩẫậắằẳẵặẹẻẽềềểỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵýỷỹ\s]+$/;

// ─── Số lượng thân thích tối đa cho mỗi người bị giam ───────────────────────
export const MAX_RELATIVES_PER_INMATE = 10;

// ─── Create/Update Relative schema (admin form) ─────────────────────────────

export const relativeFormSchema = z.object({
  full_name: z
    .string({ required_error: 'Vui lòng nhập họ và tên.' })
    .min(2, 'Họ và tên phải từ 2 đến 100 ký tự.')
    .max(100, 'Họ và tên phải từ 2 đến 100 ký tự.')
    .regex(vietnameseNameRegex, 'Họ và tên chỉ được chứa chữ cái và khoảng trắng.'),

  date_of_birth: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      // Ngày sinh không bắt buộc; nếu có thì phải là ngày trong quá khứ (UTC+7).
      (val) => !val || isPastDateVN(val),
      { message: 'Ngày sinh phải là ngày trong quá khứ.' },
    ),

  relationship: z
    .string({ required_error: 'Vui lòng nhập mối quan hệ.' })
    .min(2, 'Mối quan hệ phải từ 2 đến 50 ký tự.')
    .max(50, 'Mối quan hệ phải từ 2 đến 50 ký tự.'),
});

export type RelativeFormData = z.infer<typeof relativeFormSchema>;

// ─── Import row schema (thêm cột Số giam) ───────────────────────────────────
// Dùng cho việc parse từng dòng Excel khi import hàng loạt.

export const relativeImportRowSchema = relativeFormSchema.extend({
  prison_number: z
    .string({ required_error: 'Vui lòng nhập số giam.' })
    .min(1, 'Vui lòng nhập số giam.')
    .max(50, 'Số giam tối đa 50 ký tự.'),
});

export type RelativeImportRow = z.infer<typeof relativeImportRowSchema>;
