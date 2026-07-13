import { z } from 'zod';

// ─── Time format regex (HH:mm) ─────────────────────────────────────────────
const timeFormatRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const timeString = (fieldName: string) =>
  z
    .string({ required_error: `Vui lòng nhập ${fieldName}.` })
    .min(1, `Vui lòng nhập ${fieldName}.`)
    .regex(timeFormatRegex, `${fieldName} phải có định dạng HH:mm.`);

// ─── Scheduling Settings schema ─────────────────────────────────────────────

export const schedulingSettingsSchema = z
  .object({
    visit_time: z
      .number({
        required_error: 'Vui lòng nhập thời gian thăm gặp.',
        invalid_type_error: 'Vui lòng nhập thời gian thăm gặp.',
      })
      .int('Thời gian thăm gặp phải là số nguyên.')
      .min(10, 'Thời gian thăm gặp phải từ 10 đến 120 phút.')
      .max(120, 'Thời gian thăm gặp phải từ 10 đến 120 phút.'),

    morning_start_time: timeString('giờ bắt đầu buổi sáng'),
    morning_end_time: timeString('giờ kết thúc buổi sáng'),
    afternoon_start_time: timeString('giờ bắt đầu buổi chiều'),
    afternoon_end_time: timeString('giờ kết thúc buổi chiều'),

    max_visit_per_time: z
      .number({
        required_error: 'Vui lòng nhập số lượng tối đa.',
        invalid_type_error: 'Vui lòng nhập số lượng tối đa.',
      })
      .int('Số lượng tối đa phải là số nguyên.')
      .min(1, 'Số lượng tối đa phải từ 1 đến 10.')
      .max(10, 'Số lượng tối đa phải từ 1 đến 10.'),

    suitable_days: z
      .array(
        z
          .number()
          .int()
          .min(1, 'Ngày trong tuần không hợp lệ.')
          .max(7, 'Ngày trong tuần không hợp lệ.'),
      )
      .min(1, 'Vui lòng chọn ít nhất một ngày thăm gặp.'),
  })
  .refine(
    (data) => data.morning_start_time < data.morning_end_time,
    {
      message: 'Giờ bắt đầu phải trước giờ kết thúc buổi sáng.',
      path: ['morning_start_time'],
    },
  )
  .refine(
    (data) => data.afternoon_start_time < data.afternoon_end_time,
    {
      message: 'Giờ bắt đầu phải trước giờ kết thúc buổi chiều.',
      path: ['afternoon_start_time'],
    },
  )
  .refine(
    (data) => data.morning_end_time <= data.afternoon_start_time,
    {
      message: 'Buổi sáng phải kết thúc trước khi buổi chiều bắt đầu.',
      path: ['morning_end_time'],
    },
  );

export type SchedulingSettingsFormData = z.infer<typeof schedulingSettingsSchema>;
