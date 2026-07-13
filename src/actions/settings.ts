'use server';

import { revalidatePath } from 'next/cache';

import { createServerClient } from '@/lib/supabase/server';
import * as settingsService from '@/lib/services/settings';
import type { SchedulingSettingsFormData } from '@/lib/validations/settings';
import type { ServiceResult, SchedulingSettings } from '@/types';

export async function updateSchedulingSettings(
  formData: SchedulingSettingsFormData,
): Promise<ServiceResult<SchedulingSettings>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const result = await settingsService.updateSettings(supabase, formData);

  if (result.success) {
    revalidatePath('/admin');
    revalidatePath('/');
  }

  return result;
}

export async function getSchedulingSettings(
  prisonId: string,
): Promise<ServiceResult<SchedulingSettings>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  return settingsService.getSettings(supabase, prisonId);
}

export async function getCurrentAdminSettings(): Promise<ServiceResult<SchedulingSettings>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, message: 'Vui lòng đăng nhập.' };
  }

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('prison_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return { success: false, message: 'Không tìm thấy hồ sơ quản trị.' };
  }

  return settingsService.getSettings(supabase, profile.prison_id);
}

