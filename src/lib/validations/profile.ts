import { z } from 'zod';

// ─── Profile Settings schemas (display name / password / prison switch) ─────

export const displayNameSchema = z.object({
  full_name: z
    .string({ required_error: 'Vui lòng nhập tên hiển thị.' })
    .trim()
    .min(2, 'Tên hiển thị phải có ít nhất 2 ký tự.')
    .max(255, 'Tên hiển thị tối đa 255 ký tự.'),
});

export type DisplayNameFormData = z.infer<typeof displayNameSchema>;

export const changePasswordSchema = z
  .object({
    current_password: z
      .string({ required_error: 'Vui lòng nhập mật khẩu hiện tại.' })
      .min(1, 'Vui lòng nhập mật khẩu hiện tại.'),
    new_password: z
      .string({ required_error: 'Vui lòng nhập mật khẩu mới.' })
      .min(8, 'Mật khẩu mới phải có tối thiểu 8 ký tự.')
      .max(72, 'Mật khẩu mới tối đa 72 ký tự.'),
    confirm_password: z
      .string({ required_error: 'Vui lòng xác nhận mật khẩu mới.' })
      .min(1, 'Vui lòng xác nhận mật khẩu mới.'),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Mật khẩu xác nhận không khớp.',
    path: ['confirm_password'],
  })
  .refine((data) => data.new_password !== data.current_password, {
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
    path: ['new_password'],
  });

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

export const switchPrisonSchema = z.object({
  prison_id: z
    .string({ required_error: 'Vui lòng chọn trại giam.' })
    .uuid('Trại giam không hợp lệ.'),
});

export type SwitchPrisonFormData = z.infer<typeof switchPrisonSchema>;
