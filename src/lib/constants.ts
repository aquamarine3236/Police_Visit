export const APP_NAME = 'Hệ thống Quản lý Đăng ký Thăm gặp';
export const PUBLIC_ROUTE = '/';
export const ADMIN_ROUTE = '/admin';

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
