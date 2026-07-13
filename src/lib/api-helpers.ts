import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';

// ─── Vietnamese day-of-week labels (ISO: 1=Monday, 7=Sunday) ────────────────

export const DAY_LABELS: Record<number, string> = {
  1: 'Thứ Hai',
  2: 'Thứ Ba',
  3: 'Thứ Tư',
  4: 'Thứ Năm',
  5: 'Thứ Sáu',
  6: 'Thứ Bảy',
  7: 'Chủ Nhật',
};

// ─── Consistent error response builder (§6.7) ──────────────────────────────

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      success: false,
      error: { code, message, details: details ?? {} },
    },
    { status },
  );
}

// ─── Admin auth guard — returns supabase client + admin info or error ───────

export async function requireAdminAuth() {
  const supabase = await createServerClient();
  if (!supabase) {
    return {
      error: errorResponse(500, 'SERVER_ERROR', 'Supabase chưa được cấu hình.'),
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: errorResponse(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập để truy cập.'),
    };
  }

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('prison_id, role, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    return {
      error: errorResponse(401, 'UNAUTHORIZED', 'Tài khoản không hoạt động hoặc không tồn tại.'),
    };
  }

  if (!['admin', 'super_admin'].includes(profile.role)) {
    return {
      error: errorResponse(403, 'FORBIDDEN', 'Bạn không có quyền truy cập.'),
    };
  }

  return {
    supabase,
    userId: user.id,
    prisonId: profile.prison_id as string,
  };
}

// ─── Query params helper ────────────────────────────────────────────────────

export function parseQueryParams(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
  const search = searchParams.get('search') || undefined;
  const status = searchParams.get('status') || undefined;
  const dateFrom = searchParams.get('date_from') || undefined;
  const dateTo = searchParams.get('date_to') || undefined;
  const sortBy = searchParams.get('sort_by') || 'created_at';
  const sortDir = searchParams.get('sort_dir') || 'desc';

  return { page, limit, search, status, dateFrom, dateTo, sortBy, sortDir };
}
