import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { SchedulingSettings, ServiceResult } from '@/types';
import { createAnonClient } from '@/lib/supabase/server';
import {
  SCHEDULING_SETTINGS_CACHE_TAG,
  SCHEDULING_SETTINGS_CACHE_TTL,
  schedulingSettingsCacheTag,
} from '@/lib/constants';
import {
  schedulingSettingsSchema,
  type SchedulingSettingsFormData,
} from '@/lib/validations/settings';

export interface PublicSchedulingSettings {
  suitable_days: number[];
  visit_time: number;
  morning_start_time: string;
  morning_end_time: string;
  afternoon_start_time: string;
  afternoon_end_time: string;
}

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
): Promise<ServiceResult<PublicSchedulingSettings>> {
  const { data, error } = await supabase
    .from('scheduling_settings')
    .select('suitable_days, visit_time, morning_start_time, morning_end_time, afternoon_start_time, afternoon_end_time')
    .eq('prison_id', prisonId)
    .maybeSingle();
  if (error) return { success: false, message: error.message };
  if (!data) return { success: false, message: 'Chưa có cấu hình cho trại giam này.' };
  return { success: true, data: data as PublicSchedulingSettings };
}

// ─── Cached public settings (Phase 36) ──────────────────────────────────────
// Scheduling settings change rarely, so we cache the public read to remove a DB
// round-trip on every public page/API request. The cache is keyed by prisonId
// and tagged so it can be invalidated the moment settings are updated.
//
// NOTE: `unstable_cache` callbacks run outside the request scope and must not
// access dynamic sources such as `cookies()`. We therefore use a cookie-less
// anonymous client here (public/RLS-safe read only).
export async function getCachedPublicSettings(
  prisonId: string,
): Promise<ServiceResult<PublicSchedulingSettings>> {
  // IMPORTANT: only *successful* reads must be cached. The cached callback
  // therefore THROWS on failure so `unstable_cache` does not persist a
  // transient error (e.g. a DB blip or a not-yet-seeded row) for the whole TTL.
  const cached = unstable_cache(
    async (id: string): Promise<PublicSchedulingSettings> => {
      const supabase = createAnonClient();
      if (!supabase) {
        throw new Error('Supabase chưa được cấu hình.');
      }
      const result = await getPublicSettings(supabase, id);
      if (!result.success || !result.data) {
        throw new Error(result.message ?? 'Chưa có cấu hình cho trại giam này.');
      }
      return result.data;
    },
    ['public-scheduling-settings', prisonId],
    {
      tags: [SCHEDULING_SETTINGS_CACHE_TAG, schedulingSettingsCacheTag(prisonId)],
      revalidate: SCHEDULING_SETTINGS_CACHE_TTL,
    },
  );

  try {
    const data = await cached(prisonId);
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Không thể tải cấu hình lịch thăm gặp.',
    };
  }
}

// ─── Cached full settings (Phase 36) ─────────────────────────────────────────
// Caches the full scheduling-settings row by prisonId for admin/read flows.
// The `public_settings_read` RLS policy permits anonymous SELECT on this table,
// so a cookie-less anonymous client is safe to use inside `unstable_cache`.
export async function getCachedSettings(
  prisonId: string,
): Promise<ServiceResult<SchedulingSettings>> {
  // Only cache successful reads (see note in getCachedPublicSettings).
  const cached = unstable_cache(
    async (id: string): Promise<SchedulingSettings> => {
      const supabase = createAnonClient();
      if (!supabase) {
        throw new Error('Supabase chưa được cấu hình.');
      }
      const result = await getSettings(supabase, id);
      if (!result.success || !result.data) {
        throw new Error(result.message ?? 'Chưa có cấu hình cho trại giam này.');
      }
      return result.data;
    },
    ['scheduling-settings', prisonId],
    {
      tags: [SCHEDULING_SETTINGS_CACHE_TAG, schedulingSettingsCacheTag(prisonId)],
      revalidate: SCHEDULING_SETTINGS_CACHE_TTL,
    },
  );

  try {
    const data = await cached(prisonId);
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Không thể tải cấu hình.',
    };
  }
}

export async function updateSettings(
  supabase: SupabaseClient,
  formData: SchedulingSettingsFormData,
  /** Privileged client for the write (bypasses RLS). Defaults to `supabase`. */
  db: SupabaseClient = supabase,
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
    ? await db.from('scheduling_settings').update(payload).eq('prison_id', admin.prisonId).select().single()
    : await db.from('scheduling_settings').insert({ ...payload, prison_id: admin.prisonId }).select().single();

  if (result.error) return { success: false, message: result.error.message };
  return { success: true, data: result.data as SchedulingSettings };
}
