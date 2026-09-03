import { describe, it, expect } from 'vitest';

import {
  inmateFormSchema,
  inmateListQuerySchema,
  INMATE_CLASSIFICATIONS,
  INMATE_VISIT_STATUSES,
} from '@/lib/validations/inmate';

// ─── Helper: build a valid inmate form payload ──────────────────────────────

function validInmateForm() {
  return {
    prison_number: 'PN-001',
    date_of_birth: '1990-05-15',
    classification: 'Phạm nhân' as const,
    visit_status: 'Được thăm gặp' as const,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// inmateFormSchema
// ─────────────────────────────────────────────────────────────────────────────

describe('inmateFormSchema', () => {
  // ── Valid payloads ────────────────────────────────────────────────────────

  it('accepts a minimal valid payload (required fields only)', () => {
    const result = inmateFormSchema.safeParse(validInmateForm());
    expect(result.success).toBe(true);
  });

  it('accepts a full payload with all optional fields', () => {
    const result = inmateFormSchema.safeParse({
      ...validInmateForm(),
      permanent_address: '123 Đường Lê Lợi, Quận 1, TP.HCM',
      criminal_offense: 'Trộm cắp tài sản',
      arrest_date: '2022-01-10',
      admission_date: '2022-02-01',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty strings for optional text fields', () => {
    const result = inmateFormSchema.safeParse({
      ...validInmateForm(),
      permanent_address: '',
      criminal_offense: '',
    });
    expect(result.success).toBe(true);
  });

  // ── prison_number ─────────────────────────────────────────────────────────

  describe('prison_number', () => {
    it('rejects empty string', () => {
      const result = inmateFormSchema.safeParse({
        ...validInmateForm(),
        prison_number: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msgs = result.error.issues.map((i) => i.message);
        expect(msgs).toContain('Vui lòng nhập số giam phạm nhân.');
      }
    });

    it('rejects string over 50 characters', () => {
      const result = inmateFormSchema.safeParse({
        ...validInmateForm(),
        prison_number: 'A'.repeat(51),
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing field', () => {
      const { prison_number, ...rest } = validInmateForm();
      const result = inmateFormSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  // ── date_of_birth ─────────────────────────────────────────────────────────

  describe('date_of_birth', () => {
    it('rejects future dates', () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      const result = inmateFormSchema.safeParse({
        ...validInmateForm(),
        date_of_birth: future.toISOString().split('T')[0],
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid date strings', () => {
      const result = inmateFormSchema.safeParse({
        ...validInmateForm(),
        date_of_birth: 'not-a-date',
      });
      expect(result.success).toBe(false);
    });

    it('accepts empty string', () => {
      const result = inmateFormSchema.safeParse({
        ...validInmateForm(),
        date_of_birth: '',
      });
      expect(result.success).toBe(true);
    });
  });

  // ── classification ────────────────────────────────────────────────────────

  describe('classification', () => {
    it.each(INMATE_CLASSIFICATIONS)('accepts "%s"', (val) => {
      const result = inmateFormSchema.safeParse({
        ...validInmateForm(),
        classification: val,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid classification', () => {
      const result = inmateFormSchema.safeParse({
        ...validInmateForm(),
        classification: 'Invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── visit_status ──────────────────────────────────────────────────────────

  describe('visit_status', () => {
    it.each(INMATE_VISIT_STATUSES)('accepts "%s"', (val) => {
      const result = inmateFormSchema.safeParse({
        ...validInmateForm(),
        visit_status: val,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
      const result = inmateFormSchema.safeParse({
        ...validInmateForm(),
        visit_status: 'Unknown',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── optional date fields ──────────────────────────────────────────────────

  describe('arrest_date', () => {
    it('accepts past date', () => {
      const result = inmateFormSchema.safeParse({
        ...validInmateForm(),
        arrest_date: '2020-01-01',
      });
      expect(result.success).toBe(true);
    });

    it('rejects future date', () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      const result = inmateFormSchema.safeParse({
        ...validInmateForm(),
        arrest_date: future.toISOString().split('T')[0],
      });
      expect(result.success).toBe(false);
    });

    it('accepts undefined (optional)', () => {
      const result = inmateFormSchema.safeParse(validInmateForm());
      expect(result.success).toBe(true);
    });
  });

  describe('admission_date', () => {
    it('accepts past date', () => {
      const result = inmateFormSchema.safeParse({
        ...validInmateForm(),
        admission_date: '2020-06-15',
      });
      expect(result.success).toBe(true);
    });

    it('rejects future date', () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      const result = inmateFormSchema.safeParse({
        ...validInmateForm(),
        admission_date: future.toISOString().split('T')[0],
      });
      expect(result.success).toBe(false);
    });
  });

  // ── permanent_address ─────────────────────────────────────────────────────

  describe('permanent_address', () => {
    it('rejects string over 500 characters', () => {
      const result = inmateFormSchema.safeParse({
        ...validInmateForm(),
        permanent_address: 'A'.repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });

  // ── criminal_offense ──────────────────────────────────────────────────────

  describe('criminal_offense', () => {
    it('rejects string over 1000 characters', () => {
      const result = inmateFormSchema.safeParse({
        ...validInmateForm(),
        criminal_offense: 'A'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// inmateListQuerySchema
// ─────────────────────────────────────────────────────────────────────────────

describe('inmateListQuerySchema', () => {
  it('applies defaults for page and pageSize', () => {
    const result = inmateListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.includeDeleted).toBe(false);
    }
  });

  it('accepts valid query parameters', () => {
    const result = inmateListQuerySchema.safeParse({
      page: 2,
      pageSize: 50,
      search: 'Nguyễn',
      classification: 'Phạm nhân',
      includeDeleted: true,
    });
    expect(result.success).toBe(true);
  });

  it('coerces string numbers to integers', () => {
    const result = inmateListQuerySchema.safeParse({
      page: '3',
      pageSize: '25',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.pageSize).toBe(25);
    }
  });

  it('rejects page less than 1', () => {
    const result = inmateListQuerySchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects pageSize greater than 100', () => {
    const result = inmateListQuerySchema.safeParse({ pageSize: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid classification', () => {
    const result = inmateListQuerySchema.safeParse({
      classification: 'InvalidType',
    });
    expect(result.success).toBe(false);
  });
});
