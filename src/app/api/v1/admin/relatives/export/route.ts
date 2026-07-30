import { NextRequest, NextResponse } from 'next/server';

import { requireAdminAuth, errorResponse } from '@/lib/api-helpers';
import { exportRelativesToExcel } from '@/lib/services/export';

// Shape returned by the embedded-select query below.
interface RelativeWithInmate {
  full_name: string;
  date_of_birth: string | null;
  citizen_id: string;
  relationship: string;
  inmate: {
    prison_number: string;
    prison_id: string;
    deleted_at: string | null;
  } | null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth();
  if ('error' in auth) return auth.error;

  // Service-role client for the read (same as the registrations export route):
  // the JOIN below runs with a privileged client so it does NOT depend on the
  // JWT `prison_id` claim. The cookie-bound client is RLS-scoped through
  // `fn_inmate_prison_id`, which returns ZERO rows for this role → an empty
  // export file. Scoping is preserved manually via `.eq('inmate.prison_id', …)`.
  const { db: supabase, prisonId } = auth;

  // Bộ lọc tùy chọn: chỉ xuất thân thích của MỘT người bị giam theo số giam.
  const prisonNumber = request.nextUrl.searchParams.get('prison_number')?.trim();

  // JOIN sang inmates (qua FK inmate_id) để lấy Số giam, đồng thời lọc theo
  // prison của admin. Dùng !inner để loại thân thích của inmate không cùng
  // prison ngay trong 1 query (tránh N+1).
  let query = supabase
    .from('inmate_relatives')
    .select(
      'full_name, date_of_birth, citizen_id, relationship, inmate:inmates!inner(prison_number, prison_id, deleted_at)',
    )
    .eq('inmate.prison_id', prisonId)
    .is('inmate.deleted_at', null)
    .order('created_at', { ascending: true });

  if (prisonNumber) {
    query = query.eq('inmate.prison_number', prisonNumber);
  }

  const { data, error } = await query;

  if (error) {
    return errorResponse(500, 'SERVER_ERROR', error.message);
  }

  const rows = ((data ?? []) as unknown as RelativeWithInmate[]).map((r) => ({
    prison_number: r.inmate?.prison_number ?? '',
    full_name: r.full_name,
    date_of_birth: r.date_of_birth,
    citizen_id: r.citizen_id,
    relationship: r.relationship,
  }));

  const buffer = await exportRelativesToExcel(rows);
  const timestamp = new Date().toISOString().split('T')[0];
  const suffix = prisonNumber ? `-${prisonNumber}` : '';

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="danh-sach-than-thich${suffix}-${timestamp}.xlsx"`,
    },
  });
}
