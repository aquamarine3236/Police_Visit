import { NextRequest, NextResponse } from 'next/server';

import {
  requireAdminAuth,
  errorResponse,
  parseQueryParams,
} from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth();
  if ('error' in auth) return auth.error;

  // Use the service-role client for reads so the admin list does not depend on
  // the JWT `prison_id` claim being present (the RLS policy keys off it). We
  // still scope every query to `prisonId` below to preserve tenant isolation.
  const { db: supabase, prisonId } = auth;
  const { page, limit, search, status, dateFrom, dateTo, sortBy, sortDir } =
    parseQueryParams(request.nextUrl.searchParams);

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Allowed sort columns to prevent injection
  const allowedSortColumns = ['created_at', 'visit_date', 'status', 'time_slot_start'];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const ascending = sortDir === 'asc';

  // When searching, also match against visitor name / CCCD. PostgREST cannot OR
  // across two different embedded tables in one filter, so we pre-resolve the
  // registration IDs whose visitors match the term and fold them into the main
  // query as an additional OR branch.
  let matchingRegIds: string[] | null = null;
  if (search) {
    const like = `%${search}%`;

    // Registrations whose visitor name / CCCD matches the term.
    const { data: visitorMatches } = await supabase
      .from('registration_visitors')
      .select('registration_id')
      .or(`full_name.ilike.${like},citizen_id.ilike.${like}`);

    // Registrations whose inmate name / prison number matches the term.
    const { data: inmateMatches } = await supabase
      .from('visit_registrations')
      .select('id, inmate:inmates!inner(id)')
      .eq('prison_id', prisonId)
      .or(`full_name.ilike.${like},prison_number.ilike.${like}`, {
        referencedTable: 'inmates',
      });

    // Registrations whose appointment code matches the term. The code shown to
    // users is the first 8 hex chars of the UUID `id` (uppercased, dashes
    // stripped). PostgREST cannot `ilike` a UUID column, so we resolve matches
    // in JS: normalise the search term to lowercase hex and keep every id whose
    // text form starts with it. Only run this when the term looks like a code
    // (hex characters, ignoring dashes) to avoid a full scan on plain searches.
    let codeMatches: string[] = [];
    const codeTerm = search.trim().toLowerCase().replace(/-/g, '');
    if (codeTerm.length > 0 && /^[0-9a-f]+$/.test(codeTerm)) {
      const { data: idRows } = await supabase
        .from('visit_registrations')
        .select('id')
        .eq('prison_id', prisonId);
      codeMatches = (idRows ?? [])
        .map((r) => r.id as string)
        .filter((id) => id.replace(/-/g, '').toLowerCase().startsWith(codeTerm));
    }

    matchingRegIds = Array.from(
      new Set([
        ...(visitorMatches ?? []).map((v) => v.registration_id as string),
        ...(inmateMatches ?? []).map((r) => r.id as string),
        ...codeMatches,
      ]),
    );
  }

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
      visitors:registration_visitors(id, full_name, date_of_birth, citizen_id, relationship, display_order)
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
  if (matchingRegIds !== null) {
    // Restrict to the pre-resolved set of matching registration IDs. An empty
    // set (`in.()`) correctly yields zero results.
    query = query.in('id', matchingRegIds);
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
