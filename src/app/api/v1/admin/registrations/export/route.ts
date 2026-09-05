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

  // Service-role client for reads (see listing route): avoids dependency on the
  // JWT `prison_id` claim while still scoping every query to `prisonId`.
  const { db: supabase, prisonId } = auth;
  const { search, status, dateFrom, dateTo } =
    parseQueryParams(request.nextUrl.searchParams);

  // Resolve matching registration IDs the same way as the listing endpoint so
  // the exported rows mirror the on-screen filter (inmate + visitor search).
  let matchingRegIds: string[] | null = null;
  if (search) {
    const like = `%${search}%`;
    const { data: visitorMatches } = await supabase
      .from('registration_visitors')
      .select('registration_id')
      .ilike('full_name', like);
    const { data: inmateMatches } = await supabase
      .from('visit_registrations')
      .select('id, inmate:inmates!inner(id)')
      .eq('prison_id', prisonId)
      .or(`prison_number.ilike.${like}`, {
        referencedTable: 'inmates',
      });
    matchingRegIds = Array.from(
      new Set([
        ...(visitorMatches ?? []).map((v) => v.registration_id as string),
        ...(inmateMatches ?? []).map((r) => r.id as string),
      ]),
    );
  }

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
      inmate:inmates!inner(prison_number),
      visitors:registration_visitors(full_name, relationship)
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
  if (matchingRegIds !== null) {
    query = query.in('id', matchingRegIds);
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
