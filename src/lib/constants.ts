export const APP_NAME = 'Hệ thống Quản lý Đăng ký Thăm gặp';
export const PUBLIC_ROUTE = '/';
export const ADMIN_ROUTE = '/admin';

// ─── Vietnamese day-of-week labels (ISO: 1=Monday … 7=Sunday) ───────────────
// Shared source of truth for both server (services, API routes) and client so
// every surface (form, footer, dialogs, business-rule messages) stays in sync.
export const DAY_LABELS: Record<number, string> = {
  1: 'Thứ Hai',
  2: 'Thứ Ba',
  3: 'Thứ Tư',
  4: 'Thứ Năm',
  5: 'Thứ Sáu',
  6: 'Thứ Bảy',
  7: 'Chủ Nhật',
};

/** Map ISO day numbers to their Vietnamese labels (e.g. [4,5] → "Thứ Năm, Thứ Sáu"). */
export function suitableDaysToLabels(days: number[]): string[] {
  return days.map((d) => DAY_LABELS[d] ?? `Ngày ${d}`);
}

/**
 * Join day labels into a human-readable Vietnamese phrase.
 * e.g. ["Thứ Năm"] → "Thứ Năm"; ["Thứ Năm","Thứ Sáu"] → "Thứ Năm hoặc Thứ Sáu".
 */
export function formatSuitableDays(days: number[]): string {
  const labels = suitableDaysToLabels(days);
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} hoặc ${labels[labels.length - 1]}`;
}

// ─── Cache tags (Phase 36 — Performance Optimization) ───────────────────────
// Base tag applied to every cached scheduling-settings read. Revalidating this
// tag invalidates all per-prison settings caches at once.
export const SCHEDULING_SETTINGS_CACHE_TAG = 'scheduling-settings';

// Per-prison cache tag, so a settings update for one prison only invalidates
// that prison's cached entry.
export function schedulingSettingsCacheTag(prisonId: string): string {
  return `${SCHEDULING_SETTINGS_CACHE_TAG}:${prisonId}`;
}

// Default revalidation window (seconds) used as a safety net alongside
// tag-based invalidation. Settings change rarely, so a 1-hour window is safe.
export const SCHEDULING_SETTINGS_CACHE_TTL = 3600;

// ─── Rate limiting (Phase 37 — §12.5) ───────────────────────────────────────
// Public visitor registration submissions: max 10 requests per minute per IP.
export const PUBLIC_REGISTRATION_RATE_LIMIT = 10;
export const PUBLIC_REGISTRATION_RATE_WINDOW_MS = 60 * 1000;
