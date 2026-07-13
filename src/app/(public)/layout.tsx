import type { Metadata } from 'next';
import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';
import { getCachedPublicSettings } from '@/lib/services/settings';
import { DAY_LABELS } from '@/lib/api-helpers';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Cổng đăng ký thăm gặp trực tuyến',
};

// Default prison ID for the single-prison system.
const DEFAULT_PRISON_ID = '11111111-1111-1111-1111-111111111111';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // Fetch scheduling settings so the footer stays 100% in sync with the admin
  // "Cấu hình lịch" tab (allowed days, working hours, capacity per slot).
  const settingsResult = await getCachedPublicSettings(DEFAULT_PRISON_ID);
  const settings = settingsResult.success ? settingsResult.data : null;

  const suitableDaysLabels = settings
    ? settings.suitable_days.map((d) => DAY_LABELS[d] || `Ngày ${d}`)
    : [];

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink font-sans">
      <PublicHeader />
      <main className="flex-1 flex flex-col">
        {children}
      </main>
      <PublicFooter
        suitableDaysLabels={suitableDaysLabels}
        morningStartTime={settings?.morning_start_time}
        morningEndTime={settings?.morning_end_time}
        afternoonStartTime={settings?.afternoon_start_time}
        afternoonEndTime={settings?.afternoon_end_time}
        visitTime={settings?.visit_time}
        maxVisitPerTime={settings?.max_visit_per_time}
      />
    </div>
  );
}
