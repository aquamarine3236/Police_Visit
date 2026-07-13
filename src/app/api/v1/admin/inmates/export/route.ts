import { NextResponse } from 'next/server';

import { requireAdminAuth, errorResponse } from '@/lib/api-helpers';
import { exportInmatesToExcel } from '@/lib/services/export';
import type { Inmate } from '@/types';

export async function GET() {
  const auth = await requireAdminAuth();
  if ('error' in auth) return auth.error;

  const { supabase, prisonId } = auth;

  // Fetch all active inmates for this prison
  const { data, error } = await supabase
    .from('inmates')
    .select('*')
    .eq('prison_id', prisonId)
    .is('deleted_at', null)
    .order('prison_number', { ascending: true });

  if (error) {
    return errorResponse(500, 'SERVER_ERROR', error.message);
  }

  const inmates = (data ?? []) as Inmate[];
  const buffer = await exportInmatesToExcel(inmates);

  const timestamp = new Date().toISOString().split('T')[0];

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="danh-sach-pham-nhan-${timestamp}.xlsx"`,
    },
  });
}
