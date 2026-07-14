import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  Inmate,
  InmateUpdate,
  PaginatedResponse,
  ServiceResult,
} from '@/types';
import { inmateFormSchema, type InmateFormData, type InmateListQuery } from '@/lib/validations/inmate';
import { todayVN } from '@/lib/time';

// ─── Helper: get admin's prison_id from session ─────────────────────────────

async function getAdminPrisonId(
  supabase: SupabaseClient,
): Promise<{ prisonId: string; userId: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('prison_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return null;
  return { prisonId: profile.prison_id, userId: user.id };
}

// ─── getInmateById ──────────────────────────────────────────────────────────

export async function getInmateById(
  supabase: SupabaseClient,
  id: string,
): Promise<ServiceResult<Inmate>> {
  const { data, error } = await supabase
    .from('inmates')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return { success: false, message: error.message };
  }

  if (!data) {
    return {
      success: false,
      message: 'Không tìm thấy phạm nhân với số hiệu này.',
    };
  }

  return { success: true, data: data as Inmate };
}

// ─── listInmates ────────────────────────────────────────────────────────────

export async function listInmates(
  supabase: SupabaseClient,
  query: InmateListQuery,
): Promise<ServiceResult<PaginatedResponse<Inmate>>> {
  const admin = await getAdminPrisonId(supabase);
  if (!admin) {
    return { success: false, message: 'Không có quyền truy cập.' };
  }

  const { page, pageSize, search, classification, includeDeleted } = query;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let queryBuilder = supabase
    .from('inmates')
    .select('*', { count: 'exact' })
    .eq('prison_id', admin.prisonId)
    .order('created_at', { ascending: false })
    .range(from, to);

  // Soft-delete filter: exclude deleted unless explicitly requested
  if (!includeDeleted) {
    queryBuilder = queryBuilder.is('deleted_at', null);
  }

  // Search by prison_number or full_name
  if (search) {
    queryBuilder = queryBuilder.or(
      `prison_number.ilike.%${search}%,full_name.ilike.%${search}%`,
    );
  }

  // Filter by classification
  if (classification) {
    queryBuilder = queryBuilder.eq('classification', classification);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    return { success: false, message: error.message };
  }

  const total = count ?? 0;
  return {
    success: true,
    data: {
      data: (data ?? []) as Inmate[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ─── createInmate ───────────────────────────────────────────────────────────

export async function createInmate(
  supabase: SupabaseClient,
  formData: InmateFormData,
  /** Privileged client for the write (bypasses RLS). Defaults to `supabase`. */
  db: SupabaseClient = supabase,
): Promise<ServiceResult<Inmate>> {
  // Validate input
  const parsed = inmateFormSchema.safeParse(formData);
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
  if (!admin) {
    return { success: false, message: 'Không có quyền truy cập.' };
  }

  // Check uniqueness of prison_number within the same prison (active records)
  const { data: existing } = await supabase
    .from('inmates')
    .select('id')
    .eq('prison_id', admin.prisonId)
    .eq('prison_number', parsed.data.prison_number)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      message: 'Số hiệu phạm nhân đã tồn tại.',
      errors: { prison_number: ['Số hiệu phạm nhân đã tồn tại.'] },
    };
  }

  const { data, error } = await db
    .from('inmates')
    .insert({
      ...parsed.data,
      prison_id: admin.prisonId,
      citizen_id: parsed.data.citizen_id || null,
      permanent_address: parsed.data.permanent_address || null,
      criminal_offense: parsed.data.criminal_offense || null,
      arrest_date: parsed.data.arrest_date || null,
      admission_date: parsed.data.admission_date || null,
      created_by: admin.userId,
      updated_by: admin.userId,
    })
    .select()
    .single();

  if (error) {
    // Handle unique constraint violation from DB level
    if (error.code === '23505') {
      return {
        success: false,
        message: 'Số hiệu phạm nhân đã tồn tại.',
        errors: { prison_number: ['Số hiệu phạm nhân đã tồn tại.'] },
      };
    }
    return { success: false, message: error.message };
  }

  return { success: true, data: data as Inmate };
}

// ─── updateInmate ───────────────────────────────────────────────────────────

export async function updateInmate(
  supabase: SupabaseClient,
  id: string,
  formData: InmateFormData,
  /** Privileged client for the write (bypasses RLS). Defaults to `supabase`. */
  db: SupabaseClient = supabase,
): Promise<ServiceResult<Inmate>> {
  // Validate input
  const parsed = inmateFormSchema.safeParse(formData);
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
  if (!admin) {
    return { success: false, message: 'Không có quyền truy cập.' };
  }

  // Check the inmate exists and belongs to admin's prison
  const { data: existingInmate } = await supabase
    .from('inmates')
    .select('id, prison_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!existingInmate || existingInmate.prison_id !== admin.prisonId) {
    return { success: false, message: 'Không tìm thấy phạm nhân.' };
  }

  // Check uniqueness of prison_number (excluding current record)
  const { data: duplicate } = await supabase
    .from('inmates')
    .select('id')
    .eq('prison_id', admin.prisonId)
    .eq('prison_number', parsed.data.prison_number)
    .is('deleted_at', null)
    .neq('id', id)
    .maybeSingle();

  if (duplicate) {
    return {
      success: false,
      message: 'Số hiệu phạm nhân đã tồn tại.',
      errors: { prison_number: ['Số hiệu phạm nhân đã tồn tại.'] },
    };
  }

  const updatePayload: InmateUpdate = {
    ...parsed.data,
    citizen_id: parsed.data.citizen_id || null,
    permanent_address: parsed.data.permanent_address || null,
    criminal_offense: parsed.data.criminal_offense || null,
    arrest_date: parsed.data.arrest_date || null,
    admission_date: parsed.data.admission_date || null,
    updated_by: admin.userId,
  };

  const { data, error } = await db
    .from('inmates')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return {
        success: false,
        message: 'Số hiệu phạm nhân đã tồn tại.',
        errors: { prison_number: ['Số hiệu phạm nhân đã tồn tại.'] },
      };
    }
    return { success: false, message: error.message };
  }

  return { success: true, data: data as Inmate };
}

// ─── deleteInmate (soft-delete) ─────────────────────────────────────────────

export async function deleteInmate(
  supabase: SupabaseClient,
  id: string,
  /** Privileged client for the write (bypasses RLS). Defaults to `supabase`. */
  db: SupabaseClient = supabase,
): Promise<ServiceResult> {
  const admin = await getAdminPrisonId(supabase);
  if (!admin) {
    return { success: false, message: 'Không có quyền truy cập.' };
  }

  // Verify the inmate exists and belongs to admin's prison
  const { data: inmate } = await supabase
    .from('inmates')
    .select('id, prison_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!inmate || inmate.prison_id !== admin.prisonId) {
    return { success: false, message: 'Không tìm thấy phạm nhân.' };
  }

  // Block soft-deletion if future confirmed registrations exist.
  // "Hôm nay" tính theo UTC+7 để tránh lệch ngày khi server chạy UTC.
  const today = todayVN();
  const { count: futureCount, error: countError } = await supabase
    .from('visit_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('inmate_id', id)
    .eq('status', 'confirmed')
    .gte('visit_date', today);

  if (countError) {
    return { success: false, message: countError.message };
  }

  if (futureCount && futureCount > 0) {
    return {
      success: false,
      message:
        'Không thể xóa phạm nhân có lịch thăm gặp đã xác nhận trong tương lai.',
    };
  }

  // Perform soft-delete
  const { error } = await db
    .from('inmates')
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: admin.userId,
    })
    .eq('id', id);

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true };
}
