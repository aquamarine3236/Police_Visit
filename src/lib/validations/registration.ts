import { z } from 'zod';

import { isFutureDateVN, isPastDateVN } from '@/lib/time';

// ─── Vietnamese name regex (letters, spaces, Vietnamese diacritics) ─────────
const vietnameseNameRegex =
  /^[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂưăạảấầẩẫậắằẳẵặẹẻẽềềểỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵýỷỹ\s]+$/;

// ─── Inmate classification enum ─────────────────────────────────────────────
const INMATE_CLASSIFICATIONS = [
  'Người bị tạm giữ',
  'Người bị tạm giam',
  'Người bị kết án tử hình',
  'Phạm nhân',
] as const;

// ─── Visitor sub-schema (1 per visitor, embedded in array) ──────────────────

export const visitorSchema = z.object({
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
      // Ngày sinh không bắt buộc; nếu có thì phải là ngày trong quá khứ.
      // So sánh theo ngày ở UTC+7 để tránh lệch múi giờ (server chạy UTC).
      (val) => !val || isPastDateVN(val),
      { message: 'Ngày sinh phải là ngày trong quá khứ.' },
    ),

  citizen_id: z
    .string({ required_error: 'Vui lòng nhập số CCCD.' })
    .min(1, 'Vui lòng nhập số CCCD.')
    .regex(/^\d+$/, 'Số CCCD chỉ được chứa chữ số.')
    .length(12, 'Số CCCD phải gồm đúng 12 chữ số.'),

  relationship: z
    .string({ required_error: 'Vui lòng nhập mối quan hệ.' })
    .min(2, 'Mối quan hệ phải từ 2 đến 50 ký tự.')
    .max(50, 'Mối quan hệ phải từ 2 đến 50 ký tự.'),
});

// ─── Public visitor sub-schema (citizen_id hidden for security) ─────────────

export const publicVisitorSchema = z.object({
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
      (val) => !val || isPastDateVN(val),
      { message: 'Ngày sinh phải là ngày trong quá khứ.' },
    ),

  // citizen_id is intentionally omitted from the public form for security.
  // The server resolves it from the inmate_relatives table by full_name match.
  citizen_id: z.string(),

  relationship: z
    .string({ required_error: 'Vui lòng nhập mối quan hệ.' })
    .min(2, 'Mối quan hệ phải từ 2 đến 50 ký tự.')
    .max(50, 'Mối quan hệ phải từ 2 đến 50 ký tự.'),
});

// ─── Inmate identification sub-schema ───────────────────────────────────────

export const inmateIdentificationSchema = z.object({
  prison_number: z
    .string({ required_error: 'Vui lòng nhập số giam phạm nhân.' })
    .min(1, 'Vui lòng nhập số giam phạm nhân.')
    .max(50, 'Số giam phạm nhân tối đa 50 ký tự.'),

  full_name: z
    .string({ required_error: 'Vui lòng nhập họ và tên phạm nhân.' })
    .min(2, 'Họ và tên phải từ 2 đến 100 ký tự.')
    .max(100, 'Họ và tên phải từ 2 đến 100 ký tự.'),

  date_of_birth: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      // Ngày sinh không bắt buộc; nếu có thì phải là ngày trong quá khứ.
      // So sánh theo ngày ở UTC+7 để tránh lệch múi giờ (server chạy UTC).
      (val) => !val || isPastDateVN(val),
      { message: 'Ngày sinh phải là ngày trong quá khứ.' },
    ),

  classification: z.enum(INMATE_CLASSIFICATIONS, {
    required_error: 'Vui lòng chọn phân loại.',
    message: 'Phân loại không hợp lệ.',
  }),
});

// ─── Public inmate sub-schema (full_name hidden for security) ───────────────

export const publicInmateIdentificationSchema = z.object({
  prison_number: z
    .string({ required_error: 'Vui lòng nhập số giam phạm nhân.' })
    .min(1, 'Vui lòng nhập số giam phạm nhân.')
    .max(50, 'Số giam phạm nhân tối đa 50 ký tự.'),

  // full_name is intentionally omitted from the public form for security.
  // The server resolves it from the inmates table by prison_number lookup.
  full_name: z.string(),

  date_of_birth: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      (val) => !val || isPastDateVN(val),
      { message: 'Ngày sinh phải là ngày trong quá khứ.' },
    ),

  classification: z.enum(INMATE_CLASSIFICATIONS, {
    required_error: 'Vui lòng chọn phân loại.',
    message: 'Phân loại không hợp lệ.',
  }),
});

// ─── Full Registration Form schema (admin / internal) ──────────────────────

export const registrationFormSchema = z
  .object({
    visitors: z
      .array(visitorSchema)
      .min(1, 'Phải có ít nhất 1 người đi thăm.')
      .max(3, 'Chỉ được phép tối đa 3 người đi thăm trong một lần đăng ký.'),

    inmate: inmateIdentificationSchema,

    visit_date: z
      .string({ required_error: 'Vui lòng chọn ngày thăm gặp.' })
      .min(1, 'Vui lòng chọn ngày thăm gặp.')
      .refine(
        (val) => /^\d{4}-\d{2}-\d{2}$/.test(val.split('T')[0]),
        { message: 'Ngày thăm gặp không hợp lệ.' },
      )
      .refine(
        // Phải là ngày trong tương lai theo UTC+7 (không gồm hôm nay).
        (val) => isFutureDateVN(val),
        {
          message:
            'Ngày thăm gặp phải là ngày trong tương lai (không bao gồm hôm nay).',
        },
      ),
  })
  .refine(
    (data) => {
      // Ensure no duplicate citizen_id within the same registration
      const citizenIds = data.visitors.map((v) => v.citizen_id);
      return new Set(citizenIds).size === citizenIds.length;
    },
    {
      message: 'Số CCCD không được trùng nhau trong cùng một đăng ký.',
      path: ['visitors'],
    },
  );

// ─── Public Registration Form schema ────────────────────────────────────────
// Used by the public-facing registration form. Omits inmate.full_name and
// visitor.citizen_id (resolved server-side from the DB for security).

const visitDateSchema = z
  .string({ required_error: 'Vui lòng chọn ngày thăm gặp.' })
  .min(1, 'Vui lòng chọn ngày thăm gặp.')
  .refine(
    (val) => /^\d{4}-\d{2}-\d{2}$/.test(val.split('T')[0]),
    { message: 'Ngày thăm gặp không hợp lệ.' },
  )
  .refine(
    (val) => isFutureDateVN(val),
    {
      message:
        'Ngày thăm gặp phải là ngày trong tương lai (không bao gồm hôm nay).',
    },
  );

export const publicRegistrationFormSchema = z.object({
  visitors: z
    .array(publicVisitorSchema)
    .min(1, 'Phải có ít nhất 1 người đi thăm.')
    .max(3, 'Chỉ được phép tối đa 3 người đi thăm trong một lần đăng ký.'),

  inmate: publicInmateIdentificationSchema,

  visit_date: visitDateSchema,
});

export type VisitorFormData = z.infer<typeof visitorSchema>;
export type InmateIdentificationData = z.infer<typeof inmateIdentificationSchema>;
export type RegistrationFormData = z.infer<typeof registrationFormSchema>;
export type PublicRegistrationFormData = z.infer<typeof publicRegistrationFormSchema>;
