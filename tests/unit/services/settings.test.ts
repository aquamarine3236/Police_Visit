import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock next/cache so unstable_cache passes through to the wrapped fn ──────
// The real unstable_cache requires the Next.js runtime; in unit tests we just
// invoke the callback directly and ignore the key/options.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

// ─── Mock the cookie-less anon client used inside the cached fetchers ────────
const createAnonClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createAnonClient: () => createAnonClientMock(),
}));

import {
  getSettings,
  getPublicSettings,
  getCachedSettings,
  getCachedPublicSettings,
  updateSettings,
} from '@/lib/services/settings';
import {
  SCHEDULING_SETTINGS_CACHE_TAG,
  schedulingSettingsCacheTag,
} from '@/lib/constants';

// ─── Generic chainable mock (mirrors scheduling.test.ts) ────────────────────
function chainable(result: unknown): unknown {
  const handler: ProxyHandler<object> = {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(result);
      }
      return (..._a: unknown[]) => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

const SETTINGS_ROW = {
  id: 'settings-1',
  prison_id: 'prison-1',
  visit_time: 30,
  morning_start_time: '07:30',
  morning_end_time: '11:00',
  afternoon_start_time: '13:30',
  afternoon_end_time: '16:00',
  max_visit_per_time: 5,
  suitable_days: [4, 5],
};

function mockSupabase(settingsResult: unknown, opts: {
  existing?: unknown;
  updateResult?: unknown;
  insertResult?: unknown;
  user?: { id: string } | null;
  profile?: unknown;
} = {}) {
  const user = opts.user === undefined ? { id: 'user-1' } : opts.user;
  const profile = opts.profile ?? { data: { prison_id: 'prison-1' } };

  const fromImpl = (table: string) => {
    if (table === 'admin_profiles') return chainable(profile);
    if (table === 'scheduling_settings') {
      return {
        select: (..._a: unknown[]) =>
          chainable(opts.existing !== undefined ? opts.existing : settingsResult),
        update: (..._a: unknown[]) =>
          chainable(opts.updateResult ?? { data: SETTINGS_ROW, error: null }),
        insert: (..._a: unknown[]) =>
          chainable(opts.insertResult ?? { data: SETTINGS_ROW, error: null }),
      };
    }
    return chainable({ data: null, error: null });
  };

  return {
    from: vi.fn().mockImplementation(fromImpl),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
  } as unknown as Parameters<typeof getSettings>[0];
}

beforeEach(() => {
  createAnonClientMock.mockReset();
});

// ─── getSettings ─────────────────────────────────────────────────────────────
describe('getSettings', () => {
  it('returns settings when the row exists', async () => {
    const supabase = mockSupabase({ data: SETTINGS_ROW, error: null });
    const res = await getSettings(supabase, 'prison-1');
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.prison_id).toBe('prison-1');
  });

  it('fails when no settings row exists', async () => {
    const supabase = mockSupabase({ data: null, error: null });
    const res = await getSettings(supabase, 'prison-1');
    expect(res.success).toBe(false);
  });

  it('propagates DB errors', async () => {
    const supabase = mockSupabase({ data: null, error: { message: 'boom' } });
    const res = await getSettings(supabase, 'prison-1');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.message).toBe('boom');
  });
});

// ─── getPublicSettings ───────────────────────────────────────────────────────
describe('getPublicSettings', () => {
  it('returns the public subset of settings', async () => {
    const supabase = mockSupabase({ data: SETTINGS_ROW, error: null });
    const res = await getPublicSettings(supabase, 'prison-1');
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.suitable_days).toEqual([4, 5]);
  });
});

// ─── getCachedPublicSettings ─────────────────────────────────────────────────
describe('getCachedPublicSettings', () => {
  it('reads via a cookie-less anon client and returns data', async () => {
    createAnonClientMock.mockReturnValue(mockSupabase({ data: SETTINGS_ROW, error: null }));
    const res = await getCachedPublicSettings('prison-1');
    expect(createAnonClientMock).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.suitable_days).toEqual([4, 5]);
  });

  it('fails gracefully when Supabase is not configured', async () => {
    createAnonClientMock.mockReturnValue(null);
    const res = await getCachedPublicSettings('prison-1');
    expect(res.success).toBe(false);
  });
});

// ─── getCachedSettings ───────────────────────────────────────────────────────
describe('getCachedSettings', () => {
  it('reads the full row via the anon client', async () => {
    createAnonClientMock.mockReturnValue(mockSupabase({ data: SETTINGS_ROW, error: null }));
    const res = await getCachedSettings('prison-1');
    expect(createAnonClientMock).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.prison_id).toBe('prison-1');
  });
});

// ─── updateSettings validation ───────────────────────────────────────────────
describe('updateSettings', () => {
  const validForm = {
    visit_time: 30,
    morning_start_time: '07:30',
    morning_end_time: '11:00',
    afternoon_start_time: '13:30',
    afternoon_end_time: '16:00',
    max_visit_per_time: 5,
    suitable_days: [4, 5],
  };

  it('rejects invalid form data', async () => {
    const supabase = mockSupabase({ data: SETTINGS_ROW, error: null });
    const res = await updateSettings(supabase, { ...validForm, visit_time: 0 });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errors).toBeDefined();
  });

  it('updates when a row already exists', async () => {
    const supabase = mockSupabase(
      { data: SETTINGS_ROW, error: null },
      { existing: { data: { id: 'settings-1' } }, updateResult: { data: SETTINGS_ROW, error: null } },
    );
    const res = await updateSettings(supabase, validForm);
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.prison_id).toBe('prison-1');
  });

  it('denies update when the admin has no profile', async () => {
    const supabase = mockSupabase(
      { data: SETTINGS_ROW, error: null },
      { profile: { data: null } },
    );
    const res = await updateSettings(supabase, validForm);
    expect(res.success).toBe(false);
  });
});

// ─── Cache tag helpers ───────────────────────────────────────────────────────
describe('cache tag helpers', () => {
  it('builds a per-prison tag from the base tag', () => {
    expect(schedulingSettingsCacheTag('prison-1')).toBe(
      `${SCHEDULING_SETTINGS_CACHE_TAG}:prison-1`,
    );
  });
});
