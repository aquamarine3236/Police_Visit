import { NextResponse } from 'next/server';

import { DAY_LABELS, errorResponse } from '@/lib/api-helpers';
import { getCachedPublicSettings } from '@/lib/services/settings';
import { SCHEDULING_SETTINGS_CACHE_TTL } from '@/lib/constants';

// Default prison ID used when the system is single-prison
const DEFAULT_PRISON_ID = '11111111-1111-1111-1111-111111111111';

export async function GET() {
  // Read scheduling settings through the cached fetcher (Phase 36). This avoids
  // a DB round-trip on every public page load; the cache is invalidated via
  // `revalidateTag` whenever an admin updates the settings.
  const result = await getCachedPublicSettings(DEFAULT_PRISON_ID);

  if (!result.success || !result.data) {
    const message = result.message ?? 'Không thể tải cấu hình lịch thăm gặp.';
    const isNotFound = message.includes('Chưa có cấu hình');
    return errorResponse(
      isNotFound ? 404 : 500,
      isNotFound ? 'NOT_FOUND' : 'SERVER_ERROR',
      message,
    );
  }

  const suitableDays: number[] = result.data.suitable_days;
  const suitableDaysLabels = suitableDays.map((d) => DAY_LABELS[d] || `Ngày ${d}`);

  const noticeMessage = suitableDaysLabels.length > 0
    ? `Lưu ý: Người dân chỉ có thể đăng ký thăm gặp vào ${suitableDaysLabels.join(' và ')}.`
    : 'Lưu ý: Hiện chưa có ngày thăm gặp nào được cấu hình.';

  return NextResponse.json(
    {
      suitable_days: suitableDays,
      suitable_days_labels: suitableDaysLabels,
      notice_message: noticeMessage,
      // Full scheduling configuration mirrored to the public tab (100% sync).
      visit_time: result.data.visit_time,
      morning_start_time: result.data.morning_start_time,
      morning_end_time: result.data.morning_end_time,
      afternoon_start_time: result.data.afternoon_start_time,
      afternoon_end_time: result.data.afternoon_end_time,
      max_visit_per_time: result.data.max_visit_per_time,
    },
    {
      headers: {
        // Allow shared/CDN caches to serve the response while revalidating in
        // the background. Matches the server-side cache TTL.
        'Cache-Control': `public, s-maxage=${SCHEDULING_SETTINGS_CACHE_TTL}, stale-while-revalidate=60`,
      },
    },
  );
}
