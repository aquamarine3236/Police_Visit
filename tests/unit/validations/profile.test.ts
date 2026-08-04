import { describe, it, expect } from 'vitest';
import {
  changePasswordSchema,
  displayNameSchema,
  switchPrisonSchema,
} from '@/lib/validations/profile';

// ─── displayNameSchema ───────────────────────────────────────────────────────

describe('displayNameSchema', () => {
  it('accepts a valid display name', () => {
    expect(displayNameSchema.safeParse({ full_name: 'Nguyễn Văn A' }).success).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    const result = displayNameSchema.safeParse({ full_name: '  Nguyễn Văn A  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.full_name).toBe('Nguyễn Văn A');
    }
  });

  it('rejects an empty name', () => {
    expect(displayNameSchema.safeParse({ full_name: '' }).success).toBe(false);
  });

  it('rejects a whitespace-only name', () => {
    expect(displayNameSchema.safeParse({ full_name: '   ' }).success).toBe(false);
  });

  it('rejects a single-character name', () => {
    expect(displayNameSchema.safeParse({ full_name: 'A' }).success).toBe(false);
  });

  it('rejects names longer than 255 characters', () => {
    expect(displayNameSchema.safeParse({ full_name: 'A'.repeat(256) }).success).toBe(false);
  });

  it('rejects a missing name', () => {
    expect(displayNameSchema.safeParse({}).success).toBe(false);
  });
});

// ─── changePasswordSchema ────────────────────────────────────────────────────

function validPasswordChange(overrides = {}) {
  return {
    current_password: 'OldPassword1',
    new_password: 'NewPassword1',
    confirm_password: 'NewPassword1',
    ...overrides,
  };
}

describe('changePasswordSchema', () => {
  it('accepts a valid password change', () => {
    expect(changePasswordSchema.safeParse(validPasswordChange()).success).toBe(true);
  });

  it('rejects an empty current password', () => {
    expect(
      changePasswordSchema.safeParse(validPasswordChange({ current_password: '' })).success,
    ).toBe(false);
  });

  it('rejects a new password shorter than 8 characters', () => {
    expect(
      changePasswordSchema.safeParse(
        validPasswordChange({ new_password: 'short1', confirm_password: 'short1' }),
      ).success,
    ).toBe(false);
  });

  it('accepts a boundary-length (8 chars) new password', () => {
    expect(
      changePasswordSchema.safeParse(
        validPasswordChange({ new_password: 'Abcd1234', confirm_password: 'Abcd1234' }),
      ).success,
    ).toBe(true);
  });

  it('rejects mismatched confirmation', () => {
    expect(
      changePasswordSchema.safeParse(
        validPasswordChange({ confirm_password: 'Different1' }),
      ).success,
    ).toBe(false);
  });

  it('rejects when the new password equals the current password', () => {
    expect(
      changePasswordSchema.safeParse(
        validPasswordChange({
          current_password: 'SamePassword1',
          new_password: 'SamePassword1',
          confirm_password: 'SamePassword1',
        }),
      ).success,
    ).toBe(false);
  });

  it('rejects a missing confirmation', () => {
    expect(
      changePasswordSchema.safeParse(
        validPasswordChange({ confirm_password: '' }),
      ).success,
    ).toBe(false);
  });
});

// ─── switchPrisonSchema ──────────────────────────────────────────────────────

describe('switchPrisonSchema', () => {
  it('accepts a valid UUID', () => {
    expect(
      switchPrisonSchema.safeParse({
        prison_id: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-UUID value', () => {
    expect(switchPrisonSchema.safeParse({ prison_id: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects an empty value', () => {
    expect(switchPrisonSchema.safeParse({ prison_id: '' }).success).toBe(false);
  });

  it('rejects a missing value', () => {
    expect(switchPrisonSchema.safeParse({}).success).toBe(false);
  });
});
