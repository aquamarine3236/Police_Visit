import type { Page, Route } from '@playwright/test';

/**
 * Shared test helpers for the Phase 35 E2E suites.
 *
 * These utilities install deterministic network stubs so the tests exercise
 * the real client UI + client-server wiring without depending on a live
 * Supabase database or seeded credentials.
 */

// ─── Date helpers ───────────────────────────────────────────────────────────

/**
 * Returns a `YYYY-MM-DD` string for the next occurrence of the given ISO
 * weekday (1 = Monday … 7 = Sunday) that is strictly in the future.
 */
export function nextWeekday(isoDay: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // JS getDay(): 0 = Sunday … 6 = Saturday. Convert to ISO 1..7.
  const currentIso = d.getDay() === 0 ? 7 : d.getDay();
  let offset = (isoDay - currentIso + 7) % 7;
  if (offset === 0) offset = 7; // strictly future
  d.setDate(d.getDate() + offset);
  return formatDate(d);
}

export function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function ordinal(day: number): string {
  const j = day % 10;
  const k = day % 100;
  if (j === 1 && k !== 11) return `${day}st`;
  if (j === 2 && k !== 12) return `${day}nd`;
  if (j === 3 && k !== 13) return `${day}rd`;
  return `${day}th`;
}

/**
 * Selects a date in the react-day-picker Calendar widget. The day cells expose
 * an accessible name like "Friday, July 17th, 2026", so we navigate months
 * forward until the target cell is enabled, then click it. This drives the
 * form's `visit_date` value the same way a real user would.
 */
export async function selectVisitDate(page: Page, dateStr: string): Promise<void> {
  const target = new Date(dateStr + 'T00:00:00');
  const monthLabel = `${MONTHS[target.getMonth()]} ${target.getFullYear()}`;
  const dayFragment = `${MONTHS[target.getMonth()]} ${ordinal(target.getDate())}, ${target.getFullYear()}`;

  // Navigate to the correct month (max 24 hops as a safety bound).
  const status = page.getByRole('status');
  for (let i = 0; i < 24; i++) {
    const current = (await status.first().textContent())?.trim();
    if (current === monthLabel) break;
    await page.getByRole('button', { name: /Next Month/i }).click();
  }

  // react-day-picker v10 combined with the app's `transition-*` styling makes
  // Playwright's click stability checks unreliable, so drive selection with a
  // full DOM pointer-event sequence that RDP's onSelect responds to.
  const ariaLabel = `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][target.getDay()]}, ${dayFragment}`;
  await page.evaluate((label) => {
    const btn = document.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    if (!btn) throw new Error(`Calendar day not found: ${label}`);
    const opts = { bubbles: true, cancelable: true, view: window };
    btn.dispatchEvent(new PointerEvent('pointerdown', opts));
    btn.dispatchEvent(new MouseEvent('mousedown', opts));
    btn.dispatchEvent(new PointerEvent('pointerup', opts));
    btn.dispatchEvent(new MouseEvent('mouseup', opts));
    btn.dispatchEvent(new MouseEvent('click', opts));
  }, ariaLabel);
}

/**
 * Clicks a button reliably despite the app's pervasive CSS transitions (which
 * otherwise trip Playwright's actionability "stable" check) by dispatching a
 * full DOM pointer-event sequence on the matched element.
 */
export async function clickButtonByText(page: Page, text: string): Promise<void> {
  await page.evaluate((label) => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(label),
    );
    if (!btn) throw new Error(`Button not found: ${label}`);
    const opts = { bubbles: true, cancelable: true, view: window };
    btn.dispatchEvent(new PointerEvent('pointerdown', opts));
    btn.dispatchEvent(new MouseEvent('mousedown', opts));
    btn.dispatchEvent(new PointerEvent('pointerup', opts));
    btn.dispatchEvent(new MouseEvent('mouseup', opts));
    btn.dispatchEvent(new MouseEvent('click', opts));
  }, text);
}

/**
 * Stubs Supabase Auth network calls so navigations that touch the server-side
 * Supabase client (admin layout / middleware) resolve instantly as
 * "unauthenticated" instead of hanging on a slow/unreachable backend.
 *
 * This keeps the login + route-protection tests fast and deterministic without
 * depending on live Supabase availability.
 */
export async function mockSupabaseUnauthenticated(page: Page): Promise<void> {
  await page.route('**/auth/v1/**', async (route: Route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 401,
        error_code: 'unauthorized',
        msg: 'no session',
      }),
    });
  });
}

/**
 * Disables CSS transitions/animations for the page so element positions settle
 * immediately, keeping click interactions deterministic.
 */
export async function disableAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent =
      '*,*::before,*::after{transition:none!important;animation:none!important;}';
    document.documentElement.appendChild(style);
  });
}

// ─── Public settings stub ───────────────────────────────────────────────────

export const PUBLIC_SETTINGS = {
  suitable_days: [4, 5],
  suitable_days_labels: ['Thứ Năm', 'Thứ Sáu'],
  notice_message:
    'Lưu ý: Người dân chỉ có thể đăng ký thăm gặp vào Thứ Năm và Thứ Sáu.',
  visit_time: 30,
  morning_start_time: '08:00',
  morning_end_time: '11:30',
  afternoon_start_time: '13:30',
  afternoon_end_time: '16:30',
  max_visit_per_time: 3,
};

/**
 * Stub GET /api/v1/settings/public with a fixed suitable-days payload so the
 * public registration form renders deterministically.
 */
export async function mockPublicSettings(
  page: Page,
  payload: unknown = PUBLIC_SETTINGS,
): Promise<void> {
  await page.route('**/api/v1/settings/public', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

// ─── Server Action stubbing ─────────────────────────────────────────────────

/**
 * Next.js Server Actions are dispatched as POST requests back to the same
 * route the page was served from. This helper intercepts those POSTs and
 * returns a React Flight response that resolves the action's promise with
 * `payload`.
 *
 * The wire format mirrors a real Next.js 15 action response captured from the
 * running app, e.g.:
 *
 *   :N1783942632220.437
 *   0:{"a":"$@1","f":"","b":"development"}
 *   1:{"success":false,"message":"..."}
 *
 * Row `0` is the action-result envelope that references row `1` (the actual
 * return value) via the `$@1` promise placeholder.
 */
export async function mockServerAction(
  page: Page,
  urlGlob: string,
  payload: unknown,
): Promise<void> {
  await page.route(urlGlob, async (route: Route) => {
    const request = route.request();
    const isAction =
      request.method() === 'POST' &&
      (request.headers()['next-action'] !== undefined ||
        (request.headers()['content-type'] ?? '').includes('text/plain'));

    if (!isAction) {
      // Defer to other matching route handlers (e.g. the public settings mock)
      // and, ultimately, the network for GET navigations and asset requests.
      await route.fallback();
      return;
    }

    const devRow = `:N${Date.now()}.000\n`;
    const flight =
      devRow +
      `0:${JSON.stringify({ a: '$@1', f: '', b: 'development' })}\n` +
      `1:${JSON.stringify(payload)}\n`;

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/x-component',
      },
      body: flight,
    });
  });
}

// ─── Admin API stubs ────────────────────────────────────────────────────────

export interface MockRegistration {
  id: string;
  visit_date: string;
  time_slot_start: string;
  time_slot_end: string;
  status: 'confirmed' | 'completed' | 'no_show';
  notes: string | null;
  created_at: string;
  updated_at: string;
  inmate: { id: string; prison_number: string; full_name: string };
  visitors: Array<{
    id: string;
    full_name: string;
    citizen_id: string;
    relationship: string;
    display_order: number;
  }>;
}

export function buildRegistrations(): MockRegistration[] {
  return [
    {
      id: '11111111-aaaa-bbbb-cccc-000000000001',
      visit_date: '2026-08-06',
      time_slot_start: '07:30:00',
      time_slot_end: '08:00:00',
      status: 'confirmed',
      notes: null,
      created_at: '2026-07-01T02:00:00.000Z',
      updated_at: '2026-07-01T02:00:00.000Z',
      inmate: { id: 'inm-1', prison_number: 'PN-001', full_name: 'Nguyễn Văn An' },
      visitors: [
        {
          id: 'v-1',
          full_name: 'Trần Thị Mai',
          citizen_id: '012345678901',
          relationship: 'Mẹ',
          display_order: 1,
        },
      ],
    },
    {
      id: '22222222-aaaa-bbbb-cccc-000000000002',
      visit_date: '2026-08-07',
      time_slot_start: '08:00:00',
      time_slot_end: '08:30:00',
      status: 'completed',
      notes: null,
      created_at: '2026-07-02T02:00:00.000Z',
      updated_at: '2026-07-02T02:00:00.000Z',
      inmate: { id: 'inm-2', prison_number: 'PN-002', full_name: 'Lê Văn Bình' },
      visitors: [
        {
          id: 'v-2',
          full_name: 'Phạm Thị Cúc',
          citizen_id: '098765432109',
          relationship: 'Vợ',
          display_order: 1,
        },
      ],
    },
  ];
}

/**
 * Stub the admin registrations list endpoint, applying a subset of the
 * server-side filters (status + search) so filter-driven assertions are
 * meaningful in the browser.
 */
export async function mockAdminRegistrations(
  page: Page,
  registrations: MockRegistration[] = buildRegistrations(),
): Promise<void> {
  await page.route('**/api/v1/admin/registrations?**', async (route: Route) => {
    const url = new URL(route.request().url());
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search')?.toLowerCase();

    let data = registrations;
    if (status) data = data.filter((r) => r.status === status);
    if (search) {
      data = data.filter(
        (r) =>
          r.inmate.full_name.toLowerCase().includes(search) ||
          r.inmate.prison_number.toLowerCase().includes(search),
      );
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data,
        pagination: {
          page: 1,
          limit: 10,
          total: data.length,
          total_pages: Math.max(1, Math.ceil(data.length / 10)),
        },
      }),
    });
  });
}

export interface MockInmate {
  id: string;
  prison_id: string;
  prison_number: string;
  full_name: string;
  date_of_birth: string;
  citizen_id: string | null;
  classification: string;
  visit_status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function buildInmates(): MockInmate[] {
  return [
    {
      id: 'inm-1',
      prison_id: 'prison-1',
      prison_number: 'PN-001',
      full_name: 'Nguyễn Văn An',
      date_of_birth: '1990-05-15',
      citizen_id: '012345678901',
      classification: 'Phạm nhân',
      visit_status: 'Có thể thăm gặp',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      deleted_at: null,
    },
    {
      id: 'inm-2',
      prison_id: 'prison-1',
      prison_number: 'PN-002',
      full_name: 'Lê Văn Bình',
      date_of_birth: '1985-11-02',
      citizen_id: '023456789012',
      classification: 'Người bị tạm giữ',
      visit_status: 'Có thể thăm gặp',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      deleted_at: null,
    },
  ];
}

/**
 * Stub the admin inmates list endpoint with search + classification filters.
 */
export async function mockAdminInmates(
  page: Page,
  inmates: MockInmate[] = buildInmates(),
): Promise<void> {
  await page.route('**/api/v1/admin/inmates?**', async (route: Route) => {
    const url = new URL(route.request().url());
    const classification = url.searchParams.get('classification');
    const search = url.searchParams.get('search')?.toLowerCase();

    let data = inmates;
    if (classification) data = data.filter((i) => i.classification === classification);
    if (search) {
      data = data.filter(
        (i) =>
          i.full_name.toLowerCase().includes(search) ||
          i.prison_number.toLowerCase().includes(search),
      );
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data,
        pagination: {
          page: 1,
          limit: 10,
          total: data.length,
          total_pages: Math.max(1, Math.ceil(data.length / 10)),
        },
      }),
    });
  });
}
