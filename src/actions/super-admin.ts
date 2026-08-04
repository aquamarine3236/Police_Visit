'use server';

import { revalidatePath } from 'next/cache';

import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import type {
  AdminAccount,
  PrisonWithAdminCount,
  ServiceResult,
} from '@/types';

// ─── Localized RPC error messages ────────────────────────────────────────────

const RPC_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  NOT_FOUND: 'Không tìm thấy tài khoản quản trị.',
  TARGET_SUPER_ADMIN: 'Không thể phân công trại giam cho quản trị viên cấp cao.',
  EMPTY_PRISONS: 'Quản trị viên phải được phân công ít nhất một trại giam.',
  UNKNOWN_PRISON: 'Trại giam không hợp lệ.',
  ALREADY_EXISTS: 'Tài khoản quản trị đã tồn tại.',
  INVALID_ROLE: 'Vai trò không hợp lệ.',
  CANNOT_DEACTIVATE_SELF: 'Bạn không thể vô hiệu hóa tài khoản của chính mình.',
  DUPLICATE_CODE: 'Mã trại giam đã tồn tại.',
  INVALID_INPUT: 'Vui lòng nhập đầy đủ tên và mã trại giam.',
};

function rpcErrorMessage(code: string): string {
  return RPC_ERROR_MESSAGES[code] ?? 'Thao tác không thành công.';
}

function isRpcError(data: unknown): data is { error: string } {
  return Boolean(data && typeof data === 'object' && 'error' in data);
}

// ─── Helper: authenticated client (role enforcement happens in the RPCs) ─────

async function getClient() {
  const supabase = await createServerClient();
  if (!supabase) return null;
  return supabase;
}

// ─── Admin management ────────────────────────────────────────────────────────

export async function listAdmins(): Promise<ServiceResult<AdminAccount[]>> {
  const supabase = await getClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const { data, error } = await supabase.rpc('fn_sa_list_admins');

  if (error) return { success: false, message: error.message };
  if (isRpcError(data)) {
    return { success: false, message: rpcErrorMessage(data.error) };
  }

  return { success: true, data: (data ?? []) as AdminAccount[] };
}

export async function setAdminPrisons(
  adminId: string,
  prisonIds: string[],
): Promise<ServiceResult> {
  const supabase = await getClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const { data, error } = await supabase.rpc('fn_sa_set_admin_prisons', {
    p_admin_id: adminId,
    p_prison_ids: prisonIds,
  });

  if (error) return { success: false, message: error.message };
  if (isRpcError(data)) {
    return { success: false, message: rpcErrorMessage(data.error) };
  }

  revalidatePath('/admin/super');
  return { success: true, message: 'Đã cập nhật phân công trại giam.' };
}

export async function setAdminActive(
  adminId: string,
  active: boolean,
): Promise<ServiceResult> {
  const supabase = await getClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const { data, error } = await supabase.rpc('fn_sa_set_admin_active', {
    p_admin_id: adminId,
    p_active: active,
  });

  if (error) return { success: false, message: error.message };
  if (isRpcError(data)) {
    return { success: false, message: rpcErrorMessage(data.error) };
  }

  revalidatePath('/admin/super');
  return {
    success: true,
    message: active ? 'Đã kích hoạt tài khoản.' : 'Đã vô hiệu hóa tài khoản.',
  };
}

// ─── Create admin account (auth user + profile + assignments) ───────────────

export interface CreateAdminInput {
  email: string;
  password: string;
  full_name: string;
  role: 'admin' | 'super_admin';
  prison_ids: string[];
}

export async function createAdminAccount(
  input: CreateAdminInput,
): Promise<ServiceResult> {
  const supabase = await getClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  // ── Server-side validation ──
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: 'Email không hợp lệ.' };
  }
  if (!input.password || input.password.length < 8) {
    return { success: false, message: 'Mật khẩu phải có tối thiểu 8 ký tự.' };
  }
  if (!input.full_name.trim()) {
    return { success: false, message: 'Vui lòng nhập tên hiển thị.' };
  }
  if (input.role === 'admin' && input.prison_ids.length === 0) {
    return {
      success: false,
      message: 'Quản trị viên phải được phân công ít nhất một trại giam.',
    };
  }

  // ── Authorise the CALLER as super admin BEFORE using the service key ──
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, message: 'Vui lòng đăng nhập.' };
  }
  const { data: callerProfile } = await supabase
    .from('admin_profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (callerProfile?.role !== 'super_admin' || !callerProfile.is_active) {
    return { success: false, message: rpcErrorMessage('FORBIDDEN') };
  }

  // ── Create the auth user via the GoTrue Admin API (service key required) ──
  const adminClient = createServiceRoleClient();
  if (!adminClient) {
    return {
      success: false,
      message: 'SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình trên máy chủ.',
    };
  }

  const { data: created, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
    });

  if (createError || !created.user) {
    const alreadyExists =
      createError?.status === 422 ||
      /already been registered|already exists/i.test(createError?.message ?? '');
    return {
      success: false,
      message: alreadyExists
        ? 'Email này đã được đăng ký.'
        : createError?.message || 'Không tạo được tài khoản đăng nhập.',
    };
  }

  // ── Create the profile + assignments through the super-admin RPC ──
  const { data, error } = await supabase.rpc('fn_sa_create_admin_profile', {
    p_user_id: created.user.id,
    p_full_name: input.full_name.trim(),
    p_role: input.role,
    p_prison_ids: input.role === 'admin' ? input.prison_ids : [],
  });

  if (error || isRpcError(data)) {
    // Roll back the orphaned auth user so the email can be retried.
    await adminClient.auth.admin.deleteUser(created.user.id).catch(() => {});
    return {
      success: false,
      message: error?.message ?? rpcErrorMessage((data as { error: string }).error),
    };
  }

  revalidatePath('/admin/super');
  return { success: true, message: 'Đã tạo tài khoản quản trị.' };
}

// ─── Prison management ───────────────────────────────────────────────────────

export async function listPrisons(): Promise<ServiceResult<PrisonWithAdminCount[]>> {
  const supabase = await getClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const { data, error } = await supabase.rpc('fn_sa_list_prisons');

  if (error) return { success: false, message: error.message };
  if (isRpcError(data)) {
    return { success: false, message: rpcErrorMessage(data.error) };
  }

  return { success: true, data: (data ?? []) as PrisonWithAdminCount[] };
}

export interface UpsertPrisonInput {
  id?: string | null;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  is_active: boolean;
}

export async function upsertPrison(
  input: UpsertPrisonInput,
): Promise<ServiceResult> {
  const supabase = await getClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const { data, error } = await supabase.rpc('fn_sa_upsert_prison', {
    p_id: input.id ?? null,
    p_name: input.name,
    p_code: input.code,
    p_address: input.address ?? null,
    p_phone: input.phone ?? null,
    p_is_active: input.is_active,
  });

  if (error) return { success: false, message: error.message };
  if (isRpcError(data)) {
    return { success: false, message: rpcErrorMessage(data.error) };
  }

  revalidatePath('/admin/super/prisons');
  revalidatePath('/admin/super');
  return {
    success: true,
    message: input.id ? 'Đã cập nhật trại giam.' : 'Đã tạo trại giam mới.',
  };
}
