import { describe, it, expect } from 'vitest';
import { schedulingSettingsSchema } from '@/lib/validations/settings';

function validSettings(overrides = {}) {
  return {
    visit_time: 30,
    morning_start_time: '07:30',
    morning_end_time: '11:30',
    afternoon_start_time: '13:30',
    afternoon_end_time: '17:30',
    max_visit_per_time: 2,
    suitable_days: [4, 5],
    ...overrides,
  };
}

describe('schedulingSettingsSchema', () => {
  it('accepts valid settings', () => {
    expect(schedulingSettingsSchema.safeParse(validSettings()).success).toBe(true);
  });

  // ── visit_time ──────────────────────────────────────────────────────────
  describe('visit_time', () => {
    it('rejects below minimum (10)', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ visit_time: 9 })).success).toBe(false);
    });
    it('rejects above maximum (120)', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ visit_time: 121 })).success).toBe(false);
    });
    it('accepts boundary value 10', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ visit_time: 10 })).success).toBe(true);
    });
    it('accepts boundary value 120', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ visit_time: 120 })).success).toBe(true);
    });
    it('rejects non-integer', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ visit_time: 30.5 })).success).toBe(false);
    });
    it('rejects string type', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ visit_time: '30' })).success).toBe(false);
    });
  });

  // ── time format ──────────────────────────────────────────────────────────
  describe('time format', () => {
    it('rejects invalid format (HH:mm:ss)', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ morning_start_time: '07:30:00' })).success).toBe(false);
    });
    it('rejects invalid format (no colon)', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ morning_start_time: '0730' })).success).toBe(false);
    });
    it('rejects invalid hour (25:00)', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ morning_start_time: '25:00' })).success).toBe(false);
    });
    it('rejects invalid minute (07:60)', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ morning_start_time: '07:60' })).success).toBe(false);
    });
    it('accepts 00:00', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({
        morning_start_time: '00:00',
        morning_end_time: '01:00',
        afternoon_start_time: '13:00',
        afternoon_end_time: '14:00',
      })).success).toBe(true);
    });
    it('accepts 23:59', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({
        afternoon_end_time: '23:59',
      })).success).toBe(true);
    });
  });

  // ── session ordering ──────────────────────────────────────────────────────
  describe('session ordering', () => {
    it('rejects morning_start >= morning_end', () => {
      const r = schedulingSettingsSchema.safeParse(validSettings({
        morning_start_time: '11:30',
        morning_end_time: '07:30',
      }));
      expect(r.success).toBe(false);
    });
    it('rejects morning_start == morning_end', () => {
      const r = schedulingSettingsSchema.safeParse(validSettings({
        morning_start_time: '09:00',
        morning_end_time: '09:00',
      }));
      expect(r.success).toBe(false);
    });
    it('rejects afternoon_start >= afternoon_end', () => {
      const r = schedulingSettingsSchema.safeParse(validSettings({
        afternoon_start_time: '17:30',
        afternoon_end_time: '13:30',
      }));
      expect(r.success).toBe(false);
    });
    it('rejects morning_end > afternoon_start (session overlap)', () => {
      const r = schedulingSettingsSchema.safeParse(validSettings({
        morning_end_time: '14:00',
        afternoon_start_time: '13:30',
      }));
      expect(r.success).toBe(false);
    });
    it('accepts morning_end == afternoon_start (no gap, no overlap)', () => {
      const r = schedulingSettingsSchema.safeParse(validSettings({
        morning_end_time: '12:00',
        afternoon_start_time: '12:00',
      }));
      expect(r.success).toBe(true);
    });
  });

  // ── max_visit_per_time ──────────────────────────────────────────────────
  describe('max_visit_per_time', () => {
    it('rejects 0', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ max_visit_per_time: 0 })).success).toBe(false);
    });
    it('rejects 11', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ max_visit_per_time: 11 })).success).toBe(false);
    });
    it('accepts 1 (minimum)', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ max_visit_per_time: 1 })).success).toBe(true);
    });
    it('accepts 10 (maximum)', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ max_visit_per_time: 10 })).success).toBe(true);
    });
    it('rejects non-integer', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ max_visit_per_time: 2.5 })).success).toBe(false);
    });
  });

  // ── suitable_days ─────────────────────────────────────────────────────────
  describe('suitable_days', () => {
    it('rejects empty array', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ suitable_days: [] })).success).toBe(false);
    });
    it('rejects day 0', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ suitable_days: [0] })).success).toBe(false);
    });
    it('rejects day 8', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ suitable_days: [8] })).success).toBe(false);
    });
    it('accepts single day', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ suitable_days: [1] })).success).toBe(true);
    });
    it('accepts all days 1-7', () => {
      expect(schedulingSettingsSchema.safeParse(validSettings({ suitable_days: [1, 2, 3, 4, 5, 6, 7] })).success).toBe(true);
    });
  });
});
