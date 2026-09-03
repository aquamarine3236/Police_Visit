import { z } from 'zod';

import { isPastDateVN } from '@/lib/time';

// ─── Inmate classification & visit status enums ─────────────────────────────
export const INMATE_CLASSIFICATIONS = [
  'Người bị tạm giữ',
  'Người bị tạm giam',
  'Người bị kết án tử hình',
  'Phạm nhân',
] as const;

export const INMATE_VISIT_STATUSES = [
  'Được thăm gặp',
  'Hạn chế thăm gặp',
] as const;

// ─── Create/Update Inmate schema (admin form) ──────────────────────────────
// full_name and citizen_id have been removed for privacy compliance.
// The prison_number is the sole business identifier for inmates.

export const inmateFormSchema = z.object({
  prison_number: z
    .string({ required_error: 'Vui lòng nhập số giam phạm nhân.' })
    .min(1, 'Vui lòng nhập số giam phạm nhân.')
    .max(50, 'Số giam tối đa 50 ký tự.'),

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

  permanent_address: z
    .string()
    .max(500, 'Địa chỉ tối đa 500 ký tự.')
    .optional()
    .or(z.literal('')),

  criminal_offense: z
    .string()
    .max(1000, 'Mô tả tội danh tối đa 1000 ký tự.')
    .optional()
    .or(z.literal('')),

  arrest_date: z
    .string()
    .optional()
    .refine(
      (val) => !val || isPastDateVN(val),
      { message: 'Ngày bắt phải là ngày trong quá khứ.' },
    ),

  admission_date: z
    .string()
    .optional()
    .refine(
      (val) => !val || isPastDateVN(val),
      { message: 'Ngày nhập trại phải là ngày trong quá khứ.' },
    ),

  classification: z.enum(INMATE_CLASSIFICATIONS, {
    required_error: 'Vui lòng chọn phân loại hợp lệ.',
    message: 'Vui lòng chọn phân loại hợp lệ.',
  }),

  visit_status: z.enum(INMATE_VISIT_STATUSES, {
    required_error: 'Vui lòng chọn trạng thái thăm gặp hợp lệ.',
    message: 'Vui lòng chọn trạng thái thăm gặp hợp lệ.',
  }),
});

export type InmateFormData = z.infer<typeof inmateFormSchema>;

// ─── List Inmates query params ──────────────────────────────────────────────

export const inmateListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  classification: z.enum(INMATE_CLASSIFICATIONS).optional(),
  includeDeleted: z.boolean().default(false),
});

export type InmateListQuery = z.infer<typeof inmateListQuerySchema>;
