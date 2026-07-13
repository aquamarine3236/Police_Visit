import { NextRequest, NextResponse } from 'next/server';

import {
  requireAdminAuth,
  errorResponse,
  parseQueryParams,
} from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth();
  if ('error' in auth) return auth.error;

  const { supabase, prisonId } = auth;
  const { page, limit, search, status, dateFrom, dateTo, sortBy, sortDir } =
    parseQueryParams(request.nextUrl.searchParams);

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Allowed sort columns to prevent injection
  const allowedSortColumns = ['created_at', 'visit_date', 'status', 'time_slot_start'];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const ascending = sortDir === 'asc';

  // Build the base query on visit_registrations with joined data
  let query = supabase
    .from('visit_registrations')
    .select(
      `
      id,
      visit_date,
      time_slot_start,
      time_slot_end,
      status,
      notes,
      created_at,
      updated_at,
      inmate:inmates!inner(id, prison_number, full_name),
      visitors:registration_visitors(id, full_name, citizen_id, relationship, display_order)
      `,
      { count: 'exact' },
    )
    .eq('prison_id', prisonId)
    .order(safeSortBy, { ascending })
    .range(from, to);

  // Apply filters
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
    // Search on the inmate's full_name or prison_number
    query = query.or(
      `full_name.ilike.%${search}%,prison_number.ilike.%${search}%`,
      { referencedTable: 'inmates' },
    );
  }

  const { data, error, count } = await query;

  if (error) {
    return errorResponse(500, 'SERVER_ERROR', error.message);
  }

  const total = count ?? 0;

  return NextResponse.json({
    data: data ?? [],
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  });
}
