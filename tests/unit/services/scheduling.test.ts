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
  inmateResult?: unknown;
  settingsResult?: unknown;
  existingVisitorRegsResult?: unknown;
  duplicateCountResult?: unknown;
  rpcResult?: { data: unknown; error: unknown };
  insertRegResult?: unknown;
  insertVisitorsResult?: unknown;
  getUserResult?: { data: { user: { id: string } | null } };
  profileResult?: unknown;
  regFetchResult?: unknown;
  updateResult?: unknown;
  deleteRegResult?: unknown;
}

function mockSupabase(o: MockOverrides = {}) {
  const inmateResult = o.inmateResult ?? { data: null, error: null };
  const settingsResult = o.settingsResult ?? { data: { suitable_days: [4, 5] } };
  const visitorRegsResult = o.existingVisitorRegsResult ?? { data: null };
  const dupCountResult = o.duplicateCountResult ?? { count: 0, error: null };
  const insertRegResult = o.insertRegResult ?? { data: { id: 'reg-1', status: 'confirmed' }, error: null };
  const insertVisitorsResult = o.insertVisitorsResult ?? { data: [{ id: 'v1' }], error: null };
  const profileResult = o.profileResult ?? { data: { prison_id: 'prison-1' } };
  const regFetchResult = o.regFetchResult ?? { data: null };
  const updateResult = o.updateResult ?? { data: null, error: null };
  const deleteRegResult = o.deleteRegResult ?? { error: null };



  const fromImpl = (table: string) => {
    if (table === 'inmates') return chainable(inmateResult);
    if (table === 'scheduling_settings') return chainable(settingsResult);
    if (table === 'admin_profiles') return chainable(profileResult);

    if (table === 'registration_visitors') {
      return {
        select: (..._a: unknown[]) => chainable(visitorRegsResult),
        insert: (..._a: unknown[]) => chainable(insertVisitorsResult),
      };
    }

    if (table === 'visit_registrations') {
      // Return a proxy that distinguishes between .insert() and .select() chains
      return {
        select: (..._a: unknown[]) => chainable(dupCountResult),
        insert: (..._a: unknown[]) => chainable(insertRegResult),
        update: (..._a: unknown[]) => chainable(updateResult),
        delete: (..._a: unknown[]) => chainable(deleteRegResult),
      };
    }

    return chainable({ data: null, error: null });
  };

  return {
    from: vi.fn().mockImplementation(fromImpl),
    rpc: vi.fn().mockResolvedValue(
      o.rpcResult ?? { data: [{ slot_start: '07:30', slot_end: '08:00' }], error: null },
    ),
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
    expect(result.errors).toBeDefined();
  });

  it('returns error when inmate is not found', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: null, error: null },
    });
    const result = await submitRegistration(supabase, 'prison-1', validFormData());
    expect(result.success).toBe(false);
    expect(result.message).toContain('Không tìm thấy phạm nhân');
  });

  it('returns error when inmate data does not match (name mismatch)', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: { ...VALID_INMATE_DB, full_name: 'Khác Tên' }, error: null },
    });
    const result = await submitRegistration(supabase, 'prison-1', validFormData());
    expect(result.success).toBe(false);
    expect(result.message).toContain('không khớp');
  });

  it('returns error when inmate DOB does not match', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: { ...VALID_INMATE_DB, date_of_birth: '1995-01-01' }, error: null },
    });
    const result = await submitRegistration(supabase, 'prison-1', validFormData());
    expect(result.success).toBe(false);
    expect(result.message).toContain('không khớp');
  });

  it('returns error when inmate classification does not match', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: { ...VALID_INMATE_DB, classification: 'Người bị tạm giữ' }, error: null },
    });
    const result = await submitRegistration(supabase, 'prison-1', validFormData());
    expect(result.success).toBe(false);
    expect(result.message).toContain('không khớp');
  });

  it('returns error when inmate has restricted visit status', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: { ...VALID_INMATE_DB, visit_status: 'Hạn chế thăm gặp' }, error: null },
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
      inmateResult: { data: VALID_INMATE_DB, error: null },
    });
    const formData = { ...validFormData(), visit_date: monday };
    const result = await submitRegistration(supabase, 'prison-1', formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain('không phải ngày thăm gặp');
  });

  it('returns error when no time slot available', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: VALID_INMATE_DB, error: null },
      rpcResult: { data: [], error: null },
    });
    const result = await submitRegistration(supabase, 'prison-1', validFormData());
    expect(result.success).toBe(false);
    expect(result.message).toContain('Đã hết lịch');
  });

  it('returns error when monthly limit exceeded (via RPC error)', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: VALID_INMATE_DB, error: null },
      rpcResult: { data: null, error: { message: 'monthly visit limit exceeded' } },
    });
    const result = await submitRegistration(supabase, 'prison-1', validFormData());
    expect(result.success).toBe(false);
    expect(result.message).toContain('số lần thăm gặp');
  });

  it('returns success with registration and visitors on valid flow', async () => {
    const supabase = mockSupabase({
      inmateResult: { data: VALID_INMATE_DB, error: null },
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
