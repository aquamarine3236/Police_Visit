import { NextRequest, NextResponse } from 'next/server';

import {
  requireAdminAuth,
  errorResponse,
  parseQueryParams,
} from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth();
  if ('error' in auth) return auth.error;

  const { db, prisonId } = auth;
  const { page, limit, search, sortBy, sortDir } =
    parseQueryParams(request.nextUrl.searchParams);

  const classification = request.nextUrl.searchParams.get('classification') || undefined;
  const visitStatus = request.nextUrl.searchParams.get('visit_status') || undefined;
  const includeDeleted = request.nextUrl.searchParams.get('include_deleted') === 'true';

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Allowed sort columns
  const allowedSortColumns = ['created_at', 'prison_number', 'date_of_birth', 'classification', 'visit_status'];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const ascending = sortDir === 'asc';

  let query = db
    .from('inmates')
    .select('*', { count: 'exact' })
    .eq('prison_id', prisonId)
    .order(safeSortBy, { ascending })
    .range(from, to);

  // Soft-delete filter
  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  // Search by prison_number
  if (search) {
    query = query.or(
      `prison_number.ilike.%${search}%`,
    );
  }

  // Filter by classification
  if (classification) {
    query = query.eq('classification', classification);
  }

  // Filter by visit_status
  if (visitStatus) {
    query = query.eq('visit_status', visitStatus);
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
