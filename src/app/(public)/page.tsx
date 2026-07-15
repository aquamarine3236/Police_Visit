import { DAY_LABELS } from '@/lib/api-helpers';
import { getCachedPublicSettings } from '@/lib/services/settings';
import RegistrationForm from './registration-form';

// Default prison ID for the single-prison system.
const DEFAULT_PRISON_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Server component: resolve the scheduling settings on the server (through the
 * cached fetcher, invalidated via `revalidateTag` on admin edits) and hand them
 * to the client form as an initial prop. This removes the client-side
 * `/api/v1/settings/public` round-trip that previously blocked the form behind
 * a spinner on every visit — the form now renders instantly on first paint.
 */
export default async function PublicRegistrationPage() {
  const result = await getCachedPublicSettings(DEFAULT_PRISON_ID);

  let initialSettings = null;

  if (result.success && result.data) {
    const suitableDays = result.data.suitable_days;
    const suitableDaysLabels = suitableDays.map((d) => DAY_LABELS[d] || `Ngày ${d}`);
    const noticeMessage =
      suitableDaysLabels.length > 0
        ? `Lưu ý: Người dân chỉ có thể đăng ký thăm gặp vào ${suitableDaysLabels.join(' và ')} hàng tuần.`
        : 'Lưu ý: Hiện chưa có ngày thăm gặp nào được cấu hình.';

    initialSettings = {
      suitable_days: suitableDays,
      suitable_days_labels: suitableDaysLabels,
      notice_message: noticeMessage,
      visit_time: result.data.visit_time,
      morning_start_time: result.data.morning_start_time,
      morning_end_time: result.data.morning_end_time,
      afternoon_start_time: result.data.afternoon_start_time,
      afternoon_end_time: result.data.afternoon_end_time,
      max_visit_per_time: result.data.max_visit_per_time,
    };
  }

  return <RegistrationForm initialSettings={initialSettings} />;
}
