'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import * as settingsService from '@/lib/services/settings';
import {
  SCHEDULING_SETTINGS_CACHE_TAG,
  schedulingSettingsCacheTag,
} from '@/lib/constants';
import type { SchedulingSettingsFormData } from '@/lib/validations/settings';
import type { ServiceResult, SchedulingSettings } from '@/types';

export async function updateSchedulingSettings(
  formData: SchedulingSettingsFormData,
): Promise<ServiceResult<SchedulingSettings>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const db = createServiceRoleClient() ?? supabase;
  const result = await settingsService.updateSettings(supabase, formData, db);

  if (result.success) {
    // Invalidate cached scheduling settings (Phase 36) so the public API and
    // admin reads immediately reflect the new configuration.
    revalidateTag(SCHEDULING_SETTINGS_CACHE_TAG);
    if (result.data) {
      revalidateTag(schedulingSettingsCacheTag(result.data.prison_id));
    }
    revalidatePath('/admin');
    revalidatePath('/');
  }

  return result;
}

export async function getSchedulingSettings(
  prisonId: string,
): Promise<ServiceResult<SchedulingSettings>> {
  // Read through the cached fetcher (Phase 36). Invalidated on settings update.
  return settingsService.getCachedSettings(prisonId);
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

  // Read through the cached fetcher (Phase 36). Invalidated on settings update.
  return settingsService.getCachedSettings(profile.prison_id);
}

