import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { DAY_LABELS, errorResponse } from '@/lib/api-helpers';

// Default prison ID used when the system is single-prison
const DEFAULT_PRISON_ID = '11111111-1111-1111-1111-111111111111';

export async function GET() {
  const supabase = await createServerClient();
  if (!supabase) {
    return errorResponse(500, 'SERVER_ERROR', 'Supabase chưa được cấu hình.');
  }

  const { data, error } = await supabase
    .from('scheduling_settings')
    .select(
      'suitable_days, visit_time, morning_start_time, morning_end_time, afternoon_start_time, afternoon_end_time',
    )
    .eq('prison_id', DEFAULT_PRISON_ID)
    .maybeSingle();

  if (error) {
    return errorResponse(500, 'SERVER_ERROR', error.message);
  }

  if (!data) {
    return errorResponse(404, 'NOT_FOUND', 'Chưa có cấu hình cho trại giam này.');
  }

  const suitableDays: number[] = data.suitable_days;
  const suitableDaysLabels = suitableDays.map((d) => DAY_LABELS[d] || `Ngày ${d}`);

  const noticeMessage = suitableDaysLabels.length > 0
    ? `Lưu ý: Người dân chỉ có thể đăng ký thăm gặp vào ${suitableDaysLabels.join(' và ')}.`
    : 'Lưu ý: Hiện chưa có ngày thăm gặp nào được cấu hình.';

  return NextResponse.json({
    suitable_days: suitableDays,
    suitable_days_labels: suitableDaysLabels,
    notice_message: noticeMessage,
  });
}
