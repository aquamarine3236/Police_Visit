/**
 * Database seeding scripts for exercising concurrent locks and slot generation.
 *
 * These scripts generate SQL statements to:
 * 1. Seed test data for a prison, settings, inmates, and registrations
 * 2. Test fn_check_monthly_visit_limit behavior
 * 3. Test fn_assign_time_slot concurrent execution
 *
 * Usage: These tests validate the SQL generation logic and can be executed
 * against a test database via psql or Supabase CLI.
 */

import { describe, it, expect } from 'vitest';

// ─── Constants ──────────────────────────────────────────────────────────────

const TEST_PRISON_ID = '00000000-0000-0000-0000-000000000001';
const TEST_INMATE_ID_TAM_GIU = '00000000-0000-0000-0000-000000000010';
const TEST_INMATE_ID_PHAM_NHAN = '00000000-0000-0000-0000-000000000020';

// ─── SQL generators ─────────────────────────────────────────────────────────

function generatePrisonSeed(): string {
  return `
INSERT INTO prisons (id, name, code, address, phone, is_active)
VALUES (
  '${TEST_PRISON_ID}',
  'Trại giam Test',
  'TEST-001',
  '123 Đường Test, Quận Test',
  '0901234567',
  true
) ON CONFLICT (code) DO NOTHING;
`.trim();
}

function generateSettingsSeed(): string {
  return `
INSERT INTO scheduling_settings (prison_id, visit_time, morning_start_time, morning_end_time, afternoon_start_time, afternoon_end_time, max_visit_per_time, suitable_days)
VALUES (
  '${TEST_PRISON_ID}',
  30,
  '07:30', '11:30',
  '13:30', '17:30',
  2,
  '{4,5}'
) ON CONFLICT (prison_id) DO UPDATE SET
  visit_time = EXCLUDED.visit_time,
  morning_start_time = EXCLUDED.morning_start_time,
  morning_end_time = EXCLUDED.morning_end_time,
  afternoon_start_time = EXCLUDED.afternoon_start_time,
  afternoon_end_time = EXCLUDED.afternoon_end_time,
  max_visit_per_time = EXCLUDED.max_visit_per_time,
  suitable_days = EXCLUDED.suitable_days;
`.trim();
}

function generateInmateSeed(): string {
  return `
-- Inmate type "Người bị tạm giữ" (allowed 2 visits/month)
INSERT INTO inmates (id, prison_id, prison_number, full_name, date_of_birth, classification, visit_status)
VALUES (
  '${TEST_INMATE_ID_TAM_GIU}',
  '${TEST_PRISON_ID}',
  'TG-001',
  'Nguyễn Văn Tạm Giữ',
  '1990-01-01',
  'Người bị tạm giữ',
  'Có thể thăm gặp'
) ON CONFLICT DO NOTHING;

-- Inmate type "Phạm nhân" (allowed 1 visit/month)
INSERT INTO inmates (id, prison_id, prison_number, full_name, date_of_birth, classification, visit_status)
VALUES (
  '${TEST_INMATE_ID_PHAM_NHAN}',
  '${TEST_PRISON_ID}',
  'PN-001',
  'Nguyễn Văn Phạm Nhân',
  '1988-06-15',
  'Phạm nhân',
  'Có thể thăm gặp'
) ON CONFLICT DO NOTHING;
`.trim();
}

function generateMonthlyLimitTestSQL(inmateId: string, visitDate: string): string {
  return `SELECT fn_check_monthly_visit_limit('${inmateId}'::uuid, '${visitDate}'::date) AS can_visit;`;
}

function generateSlotAssignmentSQL(prisonId: string, visitDate: string, inmateId: string): string {
  return `SELECT * FROM fn_assign_time_slot('${prisonId}'::uuid, '${visitDate}'::date, '${inmateId}'::uuid);`;
}

function generateConcurrentLockTestSQL(visitDate: string): string {
  return `
-- Simulate concurrent slot assignment (run in separate transactions)
-- Session 1:
BEGIN;
SELECT * FROM fn_assign_time_slot('${TEST_PRISON_ID}'::uuid, '${visitDate}'::date, '${TEST_INMATE_ID_TAM_GIU}'::uuid);
-- Do NOT commit yet; this holds the advisory lock

-- Session 2 (in a separate connection):
-- BEGIN;
-- SELECT * FROM fn_assign_time_slot('${TEST_PRISON_ID}'::uuid, '${visitDate}'::date, '${TEST_INMATE_ID_PHAM_NHAN}'::uuid);
-- This should BLOCK until Session 1 commits

-- Session 1:
COMMIT;
-- Now Session 2 proceeds
`.trim();
}

function generateFillSlotsSQL(visitDate: string): string {
  // With visit_time=30 and morning 07:30-11:30, there are 8 morning slots.
  // With max_visit_per_time=2, each slot can hold 2 registrations.
  // To fill morning slot 1 (07:30-08:00), insert 2 registrations.
  const slots = [];
  let current = 7 * 60 + 30; // 07:30 in minutes
  const morningEnd = 11 * 60 + 30;
  const visitTime = 30;
  let idx = 0;

  while (current + visitTime <= morningEnd) {
    const startH = String(Math.floor(current / 60)).padStart(2, '0');
    const startM = String(current % 60).padStart(2, '0');
    const endMin = current + visitTime;
    const endH = String(Math.floor(endMin / 60)).padStart(2, '0');
    const endM = String(endMin % 60).padStart(2, '0');
    slots.push({ start: `${startH}:${startM}`, end: `${endH}:${endM}`, idx });
    current += visitTime;
    idx++;
  }

  // Also afternoon slots
  current = 13 * 60 + 30;
  const afternoonEnd = 17 * 60 + 30;
  while (current + visitTime <= afternoonEnd) {
    const startH = String(Math.floor(current / 60)).padStart(2, '0');
    const startM = String(current % 60).padStart(2, '0');
    const endMin = current + visitTime;
    const endH = String(Math.floor(endMin / 60)).padStart(2, '0');
    const endM = String(endMin % 60).padStart(2, '0');
    slots.push({ start: `${startH}:${startM}`, end: `${endH}:${endM}`, idx });
    current += visitTime;
    idx++;
  }

  const inserts = slots.flatMap((slot) => {
    // Insert max_visit_per_time (2) registrations per slot
    return [0, 1].map((_n) =>
      `INSERT INTO visit_registrations (prison_id, inmate_id, visit_date, time_slot_start, time_slot_end, status)
VALUES ('${TEST_PRISON_ID}', '${TEST_INMATE_ID_TAM_GIU}', '${visitDate}', '${slot.start}', '${slot.end}', 'confirmed');`
    );
  });

  return `-- Fill all ${slots.length} slots × 2 = ${slots.length * 2} registrations\n${inserts.join('\n')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Database seed SQL generators', () => {
  it('generates valid prison seed SQL', () => {
    const sql = generatePrisonSeed();
    expect(sql).toContain('INSERT INTO prisons');
    expect(sql).toContain(TEST_PRISON_ID);
    expect(sql).toContain('ON CONFLICT');
  });

  it('generates valid settings seed SQL', () => {
    const sql = generateSettingsSeed();
    expect(sql).toContain('INSERT INTO scheduling_settings');
    expect(sql).toContain('visit_time');
    expect(sql).toContain('suitable_days');
    expect(sql).toContain("'{4,5}'");
  });

  it('generates valid inmate seed SQL for both classifications', () => {
    const sql = generateInmateSeed();
    expect(sql).toContain('Người bị tạm giữ');
    expect(sql).toContain('Phạm nhân');
    expect(sql).toContain(TEST_INMATE_ID_TAM_GIU);
    expect(sql).toContain(TEST_INMATE_ID_PHAM_NHAN);
  });
});

describe('Monthly visit limit SQL', () => {
  it('generates correct fn_check_monthly_visit_limit call', () => {
    const sql = generateMonthlyLimitTestSQL(TEST_INMATE_ID_TAM_GIU, '2025-01-16');
    expect(sql).toContain('fn_check_monthly_visit_limit');
    expect(sql).toContain(TEST_INMATE_ID_TAM_GIU);
    expect(sql).toContain('2025-01-16');
  });

  it('uses the correct inmate ID parameter', () => {
    const sql = generateMonthlyLimitTestSQL(TEST_INMATE_ID_PHAM_NHAN, '2025-02-01');
    expect(sql).toContain(TEST_INMATE_ID_PHAM_NHAN);
  });
});

describe('Slot assignment SQL', () => {
  it('generates correct fn_assign_time_slot call', () => {
    const sql = generateSlotAssignmentSQL(TEST_PRISON_ID, '2025-01-16', TEST_INMATE_ID_TAM_GIU);
    expect(sql).toContain('fn_assign_time_slot');
    expect(sql).toContain(TEST_PRISON_ID);
    expect(sql).toContain('2025-01-16');
    expect(sql).toContain(TEST_INMATE_ID_TAM_GIU);
  });
});

describe('Concurrent lock test SQL', () => {
  it('generates advisory lock testing SQL with BEGIN/COMMIT', () => {
    const sql = generateConcurrentLockTestSQL('2025-01-16');
    expect(sql).toContain('BEGIN');
    expect(sql).toContain('COMMIT');
    expect(sql).toContain('fn_assign_time_slot');
    expect(sql).toContain('Session 1');
    expect(sql).toContain('Session 2');
  });
});

describe('Slot filling SQL', () => {
  it('generates correct number of insert statements (16 slots × 2)', () => {
    const sql = generateFillSlotsSQL('2025-01-16');
    const insertCount = (sql.match(/INSERT INTO visit_registrations/g) || []).length;
    // 8 morning slots + 8 afternoon slots = 16, × 2 per slot = 32
    expect(insertCount).toBe(32);
  });

  it('includes both morning and afternoon time ranges', () => {
    const sql = generateFillSlotsSQL('2025-01-16');
    expect(sql).toContain("'07:30'");
    expect(sql).toContain("'11:00'");
    expect(sql).toContain("'13:30'");
    expect(sql).toContain("'17:00'");
  });

  it('uses the correct visit_date', () => {
    const sql = generateFillSlotsSQL('2025-03-20');
    expect(sql).toContain('2025-03-20');
    expect(sql).not.toContain('2025-01-16');
  });
});
