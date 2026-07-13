import { describe, it, expect, vi } from 'vitest';
import { submitRegistration, updateRegistrationStatus } from '@/lib/services/scheduling';

// ─── Generic chainable mock ─────────────────────────────────────────────────
// Every method returns the same proxy so that any chain like
// .select().eq().eq().is().maybeSingle() resolves to `result`.

function chainable(result: unknown): unknown {
  const handler: ProxyHandler<object> = {
    get(_target, prop: string) {
      // Allow `await` / thenable
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(result);
      }
      // Any method call returns a new chainable proxy
      return (..._args: unknown[]) => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

// ─── Supabase mock factory ──────────────────────────────────────────────────

interface MockOverrides {
  // Result returned by the `fn_lookup_inmate_for_registration` RPC. When a bare
  // inmate object is provided it is wrapped as `{ data: [inmate], error: null }`.
  inmateResult?: { data: unknown; error: unknown };
  settingsResult?: unknown;
  // Result returned by the `fn_submit_registration` RPC.
  submitResult?: { data: unknown; error: unknown };
  getUserResult?: { data: { user: { id: string } | null } };
  profileResult?: unknown;
  regFetchResult?: unknown;
  updateResult?: unknown;
}

function mockSupabase(o: MockOverrides = {}) {
  const settingsResult = o.settingsResult ?? { data: { suitable_days: [4, 5] } };
  const profileResult = o.profileResult ?? { data: { prison_id: 'prison-1' } };
  const regFetchResult = o.regFetchResult ?? { data: null };
  const updateResult = o.updateResult ?? { data: null, error: null };

  // `fn_lookup_inmate_for_registration` returns rows (array). Accept either a
  // pre-shaped `{ data, error }` or `undefined` (=> not found).
  const inmateRpcResult = o.inmateResult ?? { data: [], error: null };

  // `fn_submit_registration` returns a JSONB object. Default = success payload.
  const submitRpcResult =
    o.submitResult ?? {
      data: {
        registration: { id: 'reg-1', status: 'confirmed' },
        visitors: [{ id: 'v1' }],
      },
      error: null,
    };

  const fromImpl = (table: string) => {
    if (table === 'scheduling_settings') return chainable(settingsResult);
    if (table === 'admin_profiles') return chainable(profileResult);
    if (table === 'visit_registrations') {
      return {
        select: (..._a: unknown[]) => chainable(regFetchResult),
        update: (..._a: unknown[]) => chainable(updateResult),
      };
    }
    return chainable({ data: null, error: null });
  };

  const rpcImpl = (fn: string) => {
    if (fn === 'fn_lookup_inmate_for_registration') {
      return Promise.resolve(inmateRpcResult);
    }
    if (fn === 'fn_submit_registration') {
      return Promise.resolve(submitRpcResult);
    }
    return Promise.resolve({ data: null, error: null });
  };

  return {
    from: vi.fn().mockImplementation(fromImpl),
    rpc: vi.fn().mockImplementation(rpcImpl),
    auth: {
      getUser: vi.fn().mockResolvedValue(
        o.getUserResult ?? { data: { user: { id: 'user-1' } } },
      ),
    },
  } as unknown as Parameters<typeof submitRegistration>[0];
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

/**
 * Returns a future date string where
 * new Date(date + 'T00:00:00+07:00').getUTCDay() is 4 or 5.
 * Midnight+07:00 = previous day 17:00 UTC, so we need a
 * local Friday (getUTCDay=4) or Saturday (getUTCDay=5).
 */
function futureSuitableDate(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  // Target: local Friday (day=5)
  const offset = ((5 - day) + 7) % 7 || 7;
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const VALID_INMATE_DB = {
  id: 'inmate-1',
  prison_id: 'prison-1',
  full_name: 'Nguyễn Văn An',
  date_of_birth: '1990-05-15',
  classification: 'Phạm nhân',
  visit_status: 'Có thể thăm gặp',
  deleted_at: null,
};

function validFormData() {
  return {
    visitors: [{
      full_name: 'Trần Thị Mai',
      date_of_birth: '1985-03-20',
      citizen_id: '012345678901',
      relationship: 'Mẹ',
    }],
    inmate: {
      prison_number: 'PN-001',
      full_name: 'Nguyễn Văn An',
      date_of_birth: '1990-05-15',
      classification: 'Phạm nhân' as const,
    },
    visit_date: futureSuitableDate(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// submitRegistration
// ─────────────────────────────────────────────────────────────────────────────

describe('submitRegistration', () => {
  it('returns validation error for invalid form data', async () => {
    const supabase = mockSupabase();
    const result = await submitRegistration(supabase, 'prison-1', {
      visitors: [],
      inmate: { prison_number: '', full_name: '', date_of_birth: '', classification: 'Phạm nhân' as const },
      visit_date: '',
    });
    expect(result.success).toBe(false);
    expect(result.message).toBe('Dữ liệu không hợp lệ.');
    if (!result.success) expect(result.errors).toBeDefined();
  });

  it('returns error when inmate is not found', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: [], error: null },
    });
    const result = await submitRegistration(supabase, 'prison-1', validFormData());
    expect(result.success).toBe(false);
    expect(result.message).toContain('Không tìm thấy phạm nhân');
  });

  it('returns error when inmate data does not match (name mismatch)', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: [{ ...VALID_INMATE_DB, full_name: 'Khác Tên' }], error: null },
    });
    const result = await submitRegistration(supabase, 'prison-1', validFormData());
    expect(result.success).toBe(false);
    expect(result.message).toContain('không khớp');
  });

  it('returns error when inmate DOB does not match', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: [{ ...VALID_INMATE_DB, date_of_birth: '1995-01-01' }], error: null },
    });
    const result = await submitRegistration(supabase, 'prison-1', validFormData());
    expect(result.success).toBe(false);
    expect(result.message).toContain('không khớp');
  });

  it('returns error when inmate classification does not match', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: [{ ...VALID_INMATE_DB, classification: 'Người bị tạm giữ' }], error: null },
    });
    const result = await submitRegistration(supabase, 'prison-1', validFormData());
    expect(result.success).toBe(false);
    expect(result.message).toContain('không khớp');
  });

  it('returns error when inmate has restricted visit status', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: [{ ...VALID_INMATE_DB, visit_status: 'Hạn chế thăm gặp' }], error: null },
    });
    const result = await submitRegistration(supabase, 'prison-1', validFormData());
    expect(result.success).toBe(false);
    expect(result.message).toContain('hạn chế thăm gặp');
  });

  it('returns error when visit date is not a suitable day', async () => {
    // Use a Wednesday: getUTCDay after +07:00 conversion = Tuesday = 2, not in [4,5]
    const d = new Date();
    const day = d.getDay();
    const offset = ((3 - day) + 7) % 7 || 7;
    d.setDate(d.getDate() + offset);
    const monday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const supabase = mockSupabase({
      inmateResult: { data: [VALID_INMATE_DB], error: null },
    });
    const formData = { ...validFormData(), visit_date: monday };
    const result = await submitRegistration(supabase, 'prison-1', formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain('không phải ngày thăm gặp');
  });

  it('returns error when no time slot available', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: [VALID_INMATE_DB], error: null },
      submitResult: { data: { error: 'NO_SLOT' }, error: null },
    });
    const result = await submitRegistration(supabase, 'prison-1', validFormData());
    expect(result.success).toBe(false);
    expect(result.message).toContain('Đã hết lịch');
  });

  it('returns error when monthly limit exceeded (via RPC result)', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: [VALID_INMATE_DB], error: null },
      submitResult: { data: { error: 'MONTHLY_LIMIT' }, error: null },
    });
    const result = await submitRegistration(supabase, 'prison-1', validFormData());
    expect(result.success).toBe(false);
    expect(result.message).toContain('số lần thăm gặp');
  });

  it('returns error when duplicate registration exists (via RPC result)', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: [VALID_INMATE_DB], error: null },
      submitResult: { data: { error: 'DUPLICATE' }, error: null },
    });
    const result = await submitRegistration(supabase, 'prison-1', validFormData());
    expect(result.success).toBe(false);
    expect(result.message).toContain('đã đăng ký');
  });

  it('returns success with registration and visitors on valid flow', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: [VALID_INMATE_DB], error: null },
    });
    const result = await submitRegistration(supabase, 'prison-1', validFormData());
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.registration).toBeDefined();
    expect(result.data?.visitors).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateRegistrationStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('updateRegistrationStatus', () => {
  it('returns error when user is not authenticated', async () => {
    const supabase = mockSupabase({
      getUserResult: { data: { user: null } },
    });
    const result = await updateRegistrationStatus(supabase, 'reg-1', 'completed');
    expect(result.success).toBe(false);
    expect(result.message).toContain('quyền truy cập');
  });

  it('returns error when admin profile is not found', async () => {
    const supabase = mockSupabase({
      profileResult: { data: null },
    });
    const result = await updateRegistrationStatus(supabase, 'reg-1', 'completed');
    expect(result.success).toBe(false);
    expect(result.message).toContain('quyền truy cập');
  });

  it('returns error when registration is not found', async () => {
    const supabase = mockSupabase({
      regFetchResult: { data: null },
    });
    const result = await updateRegistrationStatus(supabase, 'reg-999', 'completed');
    expect(result.success).toBe(false);
    expect(result.message).toContain('Không tìm thấy đăng ký');
  });
});
