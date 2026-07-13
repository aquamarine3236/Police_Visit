'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createServerClient } from '@/lib/supabase/server';

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { success: false, message: 'Vui lòng nhập email và mật khẩu.' };
  }

  const supabase = await createServerClient();

  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      success: false,
      message: error.message || 'Đăng nhập không thành công.',
    };
  }

  revalidatePath('/admin');
  redirect('/admin');
}

export async function logout() {
  const supabase = await createServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  revalidatePath('/admin');
  redirect('/admin/login');
}
