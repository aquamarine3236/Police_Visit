import { describe, it, expect } from 'vitest';
import {
  visitorSchema,
  inmateIdentificationSchema,
  registrationFormSchema,
} from '@/lib/validations/registration';

function validVisitor(overrides = {}) {
  return {
    full_name: 'Trần Thị Mai',
    date_of_birth: '1985-03-20',
    citizen_id: '012345678901',
    relationship: 'Mẹ',
    ...overrides,
  };
}

function validInmateId(overrides = {}) {
  return {
    prison_number: 'PN-001',
    full_name: 'Nguyễn Văn An',
    date_of_birth: '1990-05-15',
    classification: 'Phạm nhân' as const,
    ...overrides,
  };
}

function futureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

function validForm(overrides = {}) {
  return { visitors: [validVisitor()], inmate: validInmateId(), visit_date: futureDate(), ...overrides };
}

describe('visitorSchema', () => {
  it('accepts valid visitor', () => {
    expect(visitorSchema.safeParse(validVisitor()).success).toBe(true);
  });
  it('rejects empty full_name', () => {
    expect(visitorSchema.safeParse(validVisitor({ full_name: '' })).success).toBe(false);
  });
  it('rejects single char full_name', () => {
    expect(visitorSchema.safeParse(validVisitor({ full_name: 'A' })).success).toBe(false);
  });
  it('rejects full_name over 100 chars', () => {
    expect(visitorSchema.safeParse(validVisitor({ full_name: 'A'.repeat(101) })).success).toBe(false);
  });
  it('rejects full_name with numbers', () => {
    expect(visitorSchema.safeParse(validVisitor({ full_name: 'Trần 123' })).success).toBe(false);
  });
  it('accepts Vietnamese diacritics', () => {
    expect(visitorSchema.safeParse(validVisitor({ full_name: 'Lê Thị Hồng Nhung' })).success).toBe(true);
  });
  it('rejects empty date_of_birth', () => {
    expect(visitorSchema.safeParse(validVisitor({ date_of_birth: '' })).success).toBe(false);
  });
  it('rejects future date_of_birth', () => {
    const f = new Date(); f.setFullYear(f.getFullYear() + 1);
    expect(visitorSchema.safeParse(validVisitor({ date_of_birth: f.toISOString().split('T')[0] })).success).toBe(false);
  });
  it('requires exactly 12 digit citizen_id', () => {
    expect(visitorSchema.safeParse(validVisitor({ citizen_id: '012345678901' })).success).toBe(true);
    expect(visitorSchema.safeParse(validVisitor({ citizen_id: '1234567890' })).success).toBe(false);
    expect(visitorSchema.safeParse(validVisitor({ citizen_id: '0123456789012' })).success).toBe(false);
  });
  it('rejects non-numeric citizen_id', () => {
    expect(visitorSchema.safeParse(validVisitor({ citizen_id: '01234567890a' })).success).toBe(false);
  });
  it('rejects empty citizen_id', () => {
    expect(visitorSchema.safeParse(validVisitor({ citizen_id: '' })).success).toBe(false);
  });
  it('rejects short relationship', () => {
    expect(visitorSchema.safeParse(validVisitor({ relationship: 'A' })).success).toBe(false);
  });
  it('rejects long relationship', () => {
    expect(visitorSchema.safeParse(validVisitor({ relationship: 'A'.repeat(51) })).success).toBe(false);
  });
});

describe('inmateIdentificationSchema', () => {
  it('accepts valid data', () => {
    expect(inmateIdentificationSchema.safeParse(validInmateId()).success).toBe(true);
  });
  it('rejects empty prison_number', () => {
    expect(inmateIdentificationSchema.safeParse(validInmateId({ prison_number: '' })).success).toBe(false);
  });
  it('rejects prison_number over 50 chars', () => {
    expect(inmateIdentificationSchema.safeParse(validInmateId({ prison_number: 'X'.repeat(51) })).success).toBe(false);
  });
  it('rejects invalid classification', () => {
    expect(inmateIdentificationSchema.safeParse(validInmateId({ classification: 'Invalid' })).success).toBe(false);
  });
  it.each(['Người bị tạm giữ', 'Người bị tạm giam', 'Phạm nhân'] as const)('accepts classification "%s"', (c) => {
    expect(inmateIdentificationSchema.safeParse(validInmateId({ classification: c })).success).toBe(true);
  });
  it('rejects future date_of_birth', () => {
    const f = new Date(); f.setFullYear(f.getFullYear() + 1);
    expect(inmateIdentificationSchema.safeParse(validInmateId({ date_of_birth: f.toISOString().split('T')[0] })).success).toBe(false);
  });
});

describe('registrationFormSchema', () => {
  it('accepts valid form with 1 visitor', () => {
    expect(registrationFormSchema.safeParse(validForm()).success).toBe(true);
  });
  it('accepts 3 visitors with unique CCCDs', () => {
    const r = registrationFormSchema.safeParse(validForm({
      visitors: [
        validVisitor({ citizen_id: '111111111111' }),
        validVisitor({ citizen_id: '222222222222', full_name: 'Lê Văn Bé' }),
        validVisitor({ citizen_id: '333333333333', full_name: 'Phạm Thị Cúc' }),
      ],
    }));
    expect(r.success).toBe(true);
  });
  it('rejects empty visitors array', () => {
    const r = registrationFormSchema.safeParse(validForm({ visitors: [] }));
    expect(r.success).toBe(false);
  });
  it('rejects more than 3 visitors', () => {
    const r = registrationFormSchema.safeParse(validForm({
      visitors: [
        validVisitor({ citizen_id: '111111111111' }),
        validVisitor({ citizen_id: '222222222222' }),
        validVisitor({ citizen_id: '333333333333' }),
        validVisitor({ citizen_id: '444444444444' }),
      ],
    }));
    expect(r.success).toBe(false);
  });
  it('rejects duplicate CCCDs', () => {
    const r = registrationFormSchema.safeParse(validForm({
      visitors: [
        validVisitor({ citizen_id: '111111111111' }),
        validVisitor({ citizen_id: '111111111111', full_name: 'Lê Văn Bé' }),
      ],
    }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map(i => i.message)).toContain('Số CCCD không được trùng nhau trong cùng một đăng ký.');
    }
  });
  it('rejects empty visit_date', () => {
    expect(registrationFormSchema.safeParse(validForm({ visit_date: '' })).success).toBe(false);
  });
  it('rejects past visit_date', () => {
    expect(registrationFormSchema.safeParse(validForm({ visit_date: '2020-01-01' })).success).toBe(false);
  });
  it('rejects today/past as visit_date (yesterday)', () => {
    // Use yesterday to avoid timezone edge cases where local today
    // vs UTC midnight can differ in date comparison
    const now = new Date();
    now.setDate(now.getDate() - 1);
    const yesterday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(registrationFormSchema.safeParse(validForm({ visit_date: yesterday })).success).toBe(false);
  });
  it('accepts future visit_date', () => {
    expect(registrationFormSchema.safeParse(validForm()).success).toBe(true);
  });
});
