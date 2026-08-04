'use server';

import { revalidatePath } from 'next/cache';

import { createServerClient } from '@/lib/supabase/server';
import {
  changePasswordSchema,
  displayNameSchema,
  switchPrisonSchema,
  type ChangePasswordFormData,
  type DisplayNameFormData,
  type SwitchPrisonFormData,
} from '@/lib/validations/profile';
import type { AdminRole, PrisonSummary, ServiceResult } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SelfProfile {
  id: string;
  email: string | null;
  full_name: string;
  role: AdminRole;
  /** Active prison (null for super_admin). */
  active_prison: PrisonSummary | null;
  /** Prisons the admin may switch to (assigned by a super admin). */
  assigned_prisons: PrisonSummary[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Maps RPC error codes to localized user-facing messages. */
const RPC_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: 'Không tìm thấy hồ sơ quản trị.',
  NOT_ASSIGNED: 'Bạn không được phân công vào trại giam này.',
  INVALID_NAME: 'Tên hiển thị không hợp lệ.',
};

function rpcErrorMessage(code: string): string {
  return RPC_ERROR_MESSAGES[code] ?? 'Thao tác không thành công.';
}

// ─── getSelfProfile ──────────────────────────────────────────────────────────

export async function getSelfProfile(): Promise<ServiceResult<SelfProfile>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, message: 'Vui lòng đăng nhập.' };
  }

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('id, prison_id, full_name, role, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    return { success: false, message: 'Không tìm thấy hồ sơ quản trị.' };
  }

  // Assigned prisons (RLS: self-read on assignments + assigned-prisons read).
  const { data: assignments } = await supabase
    .from('admin_prison_assignments')
    .select('prison_id, prison:prisons(id, name, code)')
    .eq('admin_id', user.id);

  const assignedPrisons: PrisonSummary[] = (assignments ?? [])
    .map((row) => {
      // Supabase can type embedded relations as arrays; normalize either shape.
      const prison = Array.isArray(row.prison) ? row.prison[0] : row.prison;
      return prison as PrisonSummary | null;
    })
    .filter((p): p is PrisonSummary => Boolean(p))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  const activePrison =
    assignedPrisons.find((p) => p.id === profile.prison_id) ?? null;

  return {
    success: true,
    data: {
      id: profile.id,
      email: user.email ?? null,
      full_name: profile.full_name,
      role: profile.role as AdminRole,
      active_prison: activePrison,
      assigned_prisons: assignedPrisons,
    },
  };
}

// ─── updateDisplayName ───────────────────────────────────────────────────────

export async function updateDisplayName(
  formData: DisplayNameFormData,
): Promise<ServiceResult> {
  const parsed = displayNameSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.' };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const { data, error } = await supabase.rpc('fn_update_own_display_name', {
    p_full_name: parsed.data.full_name,
  });

  if (error) {
    return { success: false, message: error.message };
  }
  if (data && typeof data === 'object' && 'error' in data) {
    return { success: false, message: rpcErrorMessage(String(data.error)) };
  }

  revalidatePath('/admin', 'layout');
  return { success: true, message: 'Đã cập nhật tên hiển thị.' };
}

// ─── changePassword ──────────────────────────────────────────────────────────

export async function changePassword(
  formData: ChangePasswordFormData,
): Promise<ServiceResult> {
  const parsed = changePasswordSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.' };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { success: false, message: 'Vui lòng đăng nhập.' };
  }

  // Verify the CURRENT password before allowing the change. Re-signing in with
  // the same session client is safe: on success it just refreshes the session.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current_password,
  });
  if (verifyError) {
    return { success: false, message: 'Mật khẩu hiện tại không đúng.' };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.new_password,
  });
  if (updateError) {
    return {
      success: false,
      message: updateError.message || 'Không thể đổi mật khẩu.',
    };
  }

  return { success: true, message: 'Đã đổi mật khẩu thành công.' };
}

// ─── switchPrison ────────────────────────────────────────────────────────────

export async function switchPrison(
  formData: SwitchPrisonFormData,
): Promise<ServiceResult> {
  const parsed = switchPrisonSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.' };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  // SECURITY DEFINER RPC — verifies the assignment server-side (NOT_ASSIGNED
  // when the target prison was not granted to this admin by a super admin).
  const { data, error } = await supabase.rpc('fn_switch_active_prison', {
    p_prison_id: parsed.data.prison_id,
  });

  if (error) {
    return { success: false, message: error.message };
  }
  if (data && typeof data === 'object' && 'error' in data) {
    return { success: false, message: rpcErrorMessage(String(data.error)) };
  }

  // Refresh the session so the JWT `prison_id` claim (used by RLS + realtime)
  // reflects the new active prison immediately.
  await supabase.auth.refreshSession();

  revalidatePath('/admin', 'layout');
  return { success: true, message: 'Đã chuyển trại giam thành công.' };
}
