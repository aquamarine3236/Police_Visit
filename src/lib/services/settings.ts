import type { SupabaseClient } from '@supabase/supabase-js';

import type { SchedulingSettings, ServiceResult } from '@/types';
import {
  schedulingSettingsSchema,
  type SchedulingSettingsFormData,
} from '@/lib/validations/settings';

async function getAdminPrisonId(
  supabase: SupabaseClient,
): Promise<{ prisonId: string; userId: string } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('prison_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return null;
  return { prisonId: profile.prison_id, userId: user.id };
}

export async function getSettings(
  supabase: SupabaseClient,
  prisonId: string,
): Promise<ServiceResult<SchedulingSettings>> {
  const { data, error } = await supabase
    .from('scheduling_settings')
    .select('*')
    .eq('prison_id', prisonId)
    .maybeSingle();
  if (error) return { success: false, message: error.message };
  if (!data) return { success: false, message: 'Chưa có cấu hình cho trại giam này.' };
  return { success: true, data: data as SchedulingSettings };
}

export async function getPublicSettings(
  supabase: SupabaseClient,
  prisonId: string,
): Promise<ServiceResult<{
  suitable_days: number[];
  visit_time: number;
  morning_start_time: string;
  morning_end_time: string;
  afternoon_start_time: string;
  afternoon_end_time: string;
}>> {
  const { data, error } = await supabase
    .from('scheduling_settings')
    .select('suitable_days, visit_time, morning_start_time, morning_end_time, afternoon_start_time, afternoon_end_time')
    .eq('prison_id', prisonId)
    .maybeSingle();
  if (error) return { success: false, message: error.message };
  if (!data) return { success: false, message: 'Chưa có cấu hình cho trại giam này.' };
  return { success: true, data };
}

export async function updateSettings(
  supabase: SupabaseClient,
  formData: SchedulingSettingsFormData,
): Promise<ServiceResult<SchedulingSettings>> {
  const parsed = schedulingSettingsSchema.safeParse(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (!fieldErrors[key]) fieldErrors[key] = [];
      fieldErrors[key].push(issue.message);
    }
    return { success: false, message: 'Dữ liệu không hợp lệ.', errors: fieldErrors };
  }

  const admin = await getAdminPrisonId(supabase);
  if (!admin) return { success: false, message: 'Không có quyền truy cập.' };

  const { data: existing } = await supabase
    .from('scheduling_settings')
    .select('id')
    .eq('prison_id', admin.prisonId)
    .maybeSingle();

  const payload = { ...parsed.data, updated_by: admin.userId };
  const result = existing
    ? await supabase.from('scheduling_settings').update(payload).eq('prison_id', admin.prisonId).select().single()
    : await supabase.from('scheduling_settings').insert({ ...payload, prison_id: admin.prisonId }).select().single();

  if (result.error) return { success: false, message: result.error.message };
  return { success: true, data: result.data as SchedulingSettings };
}
