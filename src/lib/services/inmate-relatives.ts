import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  InmateRelative,
  ServiceResult,
} from '@/types';
import {
  relativeFormSchema,
  type RelativeFormData,
  MAX_RELATIVES_PER_INMATE,
} from '@/lib/validations/inmate-relative';

// ─── Helper: get admin's prison_id from session ─────────────────────────────
// (Giống pattern trong services/inmates.ts — không tách ra file chung để tránh
// thay đổi module hiện có, nhưng logic là bản sao có chủ đích.)

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

// ─── Helper: xác thực inmate thuộc prison của admin ─────────────────────────

async function getInmateForAdmin(
  supabase: SupabaseClient,
  inmateId: string,
  prisonId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('inmates')
    .select('id, prison_id')
    .eq('id', inmateId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!data || data.prison_id !== prisonId) return null;
  return { id: data.id };
}

// ─── lookupInmateByPrisonNumber ─────────────────────────────────────────────
// Tra cứu người bị giam theo Số giam trong phạm vi prison của admin. Trả về
// các trường CHỈ ĐỌC cần hiển thị + id để tải danh sách thân thích. Không lưu
// trùng thông tin người bị giam (lấy trực tiếp từ bảng `inmates`).

export interface InmateLookupResult {
  id: string;
  prison_number: string;
  full_name: string;
  date_of_birth: string | null;
  citizen_id: string | null;
  permanent_address: string | null;
  criminal_offense: string | null;
}

export async function lookupInmateByPrisonNumber(
  supabase: SupabaseClient,
  prisonNumber: string,
  /** Privileged client for the read (bypasses RLS). Defaults to `supabase`. */
  db: SupabaseClient = supabase,
): Promise<ServiceResult<InmateLookupResult>> {
  const admin = await getAdminPrisonId(supabase);
  if (!admin) {
    return { success: false, message: 'Không có quyền truy cập.' };
  }

  const trimmed = prisonNumber.trim();
  if (!trimmed) {
    return { success: false, message: 'Vui lòng nhập số giam.' };
  }

  const { data, error } = await db
    .from('inmates')
    .select(
      'id, prison_number, full_name, date_of_birth, citizen_id, permanent_address, criminal_offense',
    )
    .eq('prison_id', admin.prisonId)
    .eq('prison_number', trimmed)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    return { success: false, message: error.message };
  }

  if (!data) {
    return {
      success: false,
      message: 'Không tìm thấy người bị giam giữ với số giam này.',
    };
  }

  return { success: true, data: data as InmateLookupResult };
}

// ─── listRelativesByInmate ──────────────────────────────────────────────────

export async function listRelativesByInmate(
  supabase: SupabaseClient,
  inmateId: string,
  /** Privileged client for the read (bypasses RLS). Defaults to `supabase`. */
  db: SupabaseClient = supabase,
): Promise<ServiceResult<InmateRelative[]>> {
  const admin = await getAdminPrisonId(supabase);
  if (!admin) {
    return { success: false, message: 'Không có quyền truy cập.' };
  }

  const inmate = await getInmateForAdmin(supabase, inmateId, admin.prisonId);
  if (!inmate) {
    return { success: false, message: 'Không tìm thấy người bị giam giữ.' };
  }

  const { data, error } = await db
    .from('inmate_relatives')
    .select('*')
    .eq('inmate_id', inmateId)
    .order('created_at', { ascending: true });

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, data: (data ?? []) as InmateRelative[] };
}

// ─── createRelative ─────────────────────────────────────────────────────────

export async function createRelative(
  supabase: SupabaseClient,
  inmateId: string,
  formData: RelativeFormData,
  /** Privileged client for the write (bypasses RLS). Defaults to `supabase`. */
  db: SupabaseClient = supabase,
): Promise<ServiceResult<InmateRelative>> {
  const parsed = relativeFormSchema.safeParse(formData);
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

  const inmate = await getInmateForAdmin(supabase, inmateId, admin.prisonId);
  if (!inmate) {
    return { success: false, message: 'Không tìm thấy người bị giam giữ.' };
  }

  // Kiểm tra trần 10 người ở tầng service (song song trigger DB chống race).
  const { count, error: countError } = await supabase
    .from('inmate_relatives')
    .select('id', { count: 'exact', head: true })
    .eq('inmate_id', inmateId);

  if (countError) {
    return { success: false, message: countError.message };
  }

  if ((count ?? 0) >= MAX_RELATIVES_PER_INMATE) {
    return {
      success: false,
      message: `Mỗi người bị giam giữ chỉ được tối đa ${MAX_RELATIVES_PER_INMATE} thân thích.`,
    };
  }

  // Chống trùng CCCD trong cùng người bị giam.
  const { data: duplicate } = await supabase
    .from('inmate_relatives')
    .select('id')
    .eq('inmate_id', inmateId)
    .eq('citizen_id', parsed.data.citizen_id)
    .maybeSingle();

  if (duplicate) {
    return {
      success: false,
      message: 'Số CCCD này đã tồn tại trong danh sách thân thích.',
      errors: { citizen_id: ['Số CCCD này đã tồn tại trong danh sách thân thích.'] },
    };
  }

  const { data, error } = await db
    .from('inmate_relatives')
    .insert({
      inmate_id: inmateId,
      full_name: parsed.data.full_name.trim(),
      date_of_birth: parsed.data.date_of_birth || null,
      citizen_id: parsed.data.citizen_id,
      relationship: parsed.data.relationship.trim(),
      created_by: admin.userId,
      updated_by: admin.userId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return {
        success: false,
        message: 'Số CCCD này đã tồn tại trong danh sách thân thích.',
        errors: { citizen_id: ['Số CCCD này đã tồn tại trong danh sách thân thích.'] },
      };
    }
    return { success: false, message: error.message };
  }

  return { success: true, data: data as InmateRelative };
}

// ─── updateRelative ─────────────────────────────────────────────────────────

export async function updateRelative(
  supabase: SupabaseClient,
  id: string,
  formData: RelativeFormData,
  /** Privileged client for the write (bypasses RLS). Defaults to `supabase`. */
  db: SupabaseClient = supabase,
): Promise<ServiceResult<InmateRelative>> {
  const parsed = relativeFormSchema.safeParse(formData);
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

  // Lấy bản ghi hiện tại + xác thực inmate thuộc prison của admin.
  const { data: existing } = await supabase
    .from('inmate_relatives')
    .select('id, inmate_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    return { success: false, message: 'Không tìm thấy thân thích.' };
  }

  const inmate = await getInmateForAdmin(supabase, existing.inmate_id, admin.prisonId);
  if (!inmate) {
    return { success: false, message: 'Không tìm thấy thân thích.' };
  }

  // Chống trùng CCCD (trừ chính bản ghi này) trong cùng người bị giam.
  const { data: duplicate } = await supabase
    .from('inmate_relatives')
    .select('id')
    .eq('inmate_id', existing.inmate_id)
    .eq('citizen_id', parsed.data.citizen_id)
    .neq('id', id)
    .maybeSingle();

  if (duplicate) {
    return {
      success: false,
      message: 'Số CCCD này đã tồn tại trong danh sách thân thích.',
      errors: { citizen_id: ['Số CCCD này đã tồn tại trong danh sách thân thích.'] },
    };
  }

  const { data, error } = await db
    .from('inmate_relatives')
    .update({
      full_name: parsed.data.full_name.trim(),
      date_of_birth: parsed.data.date_of_birth || null,
      citizen_id: parsed.data.citizen_id,
      relationship: parsed.data.relationship.trim(),
      updated_by: admin.userId,
    })
    .eq('id', id)
    .select();

  if (error) {
    if (error.code === '23505') {
      return {
        success: false,
        message: 'Số CCCD này đã tồn tại trong danh sách thân thích.',
        errors: { citizen_id: ['Số CCCD này đã tồn tại trong danh sách thân thích.'] },
      };
    }
    return { success: false, message: error.message };
  }

  // Nếu không có dòng nào được cập nhật thì RLS đã chặn (bản ghi không thuộc
  // đơn vị của admin). Báo lỗi rõ ràng thay vì "thành công giả".
  if (!data || data.length === 0) {
    return {
      success: false,
      message:
        'Không thể cập nhật thân thích. Có thể do thiếu quyền hoặc bản ghi không thuộc đơn vị của bạn.',
    };
  }

  return { success: true, data: data[0] as InmateRelative };
}

// ─── deleteRelative ─────────────────────────────────────────────────────────

export async function deleteRelative(
  supabase: SupabaseClient,
  id: string,
  /** Privileged client for the write (bypasses RLS). Defaults to `supabase`. */
  db: SupabaseClient = supabase,
): Promise<ServiceResult<{ id: string }>> {
  const admin = await getAdminPrisonId(supabase);
  if (!admin) {
    return { success: false, message: 'Không có quyền truy cập.' };
  }

  const { data: existing } = await supabase
    .from('inmate_relatives')
    .select('id, inmate_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    return { success: false, message: 'Không tìm thấy thân thích.' };
  }

  const inmate = await getInmateForAdmin(supabase, existing.inmate_id, admin.prisonId);
  if (!inmate) {
    return { success: false, message: 'Không tìm thấy thân thích.' };
  }

  const { data: deleted, error } = await db
    .from('inmate_relatives')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) {
    return { success: false, message: error.message };
  }

  if (!deleted || deleted.length === 0) {
    return {
      success: false,
      message:
        'Không thể xóa thân thích. Có thể do thiếu quyền hoặc bản ghi không thuộc đơn vị của bạn.',
    };
  }

  return { success: true, data: { id } };
}
