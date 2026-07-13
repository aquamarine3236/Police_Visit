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
