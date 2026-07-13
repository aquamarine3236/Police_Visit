import { NextRequest, NextResponse } from 'next/server';

import {
  requireAdminAuth,
  errorResponse,
  parseQueryParams,
} from '@/lib/api-helpers';
import { exportRegistrationsToExcel } from '@/lib/services/export';

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth();
  if ('error' in auth) return auth.error;

  const { supabase, prisonId } = auth;
  const { search, status, dateFrom, dateTo } =
    parseQueryParams(request.nextUrl.searchParams);

  // Build query with same filters as listing endpoint
  let query = supabase
    .from('visit_registrations')
    .select(
      `
      id,
      visit_date,
      time_slot_start,
      time_slot_end,
      status,
      created_at,
      inmate:inmates!inner(prison_number, full_name),
      visitors:registration_visitors(full_name, citizen_id, relationship)
      `,
    )
    .eq('prison_id', prisonId)
    .order('visit_date', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }
  if (dateFrom) {
    query = query.gte('visit_date', dateFrom);
  }
  if (dateTo) {
    query = query.lte('visit_date', dateTo);
  }
  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,prison_number.ilike.%${search}%`,
      { referencedTable: 'inmates' },
    );
  }

  const { data, error } = await query;

  if (error) {
    return errorResponse(500, 'SERVER_ERROR', error.message);
  }

  const formattedData = (data ?? []).map((reg) => ({
    ...reg,
    inmate: Array.isArray(reg.inmate) ? reg.inmate[0] : reg.inmate,
  })) as unknown as Parameters<typeof exportRegistrationsToExcel>[0];

  const buffer = await exportRegistrationsToExcel(formattedData);

  const timestamp = new Date().toISOString().split('T')[0];

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="danh-sach-dang-ky-${timestamp}.xlsx"`,
    },
  });
}
