import { describe, it, expect } from 'vitest';
import {
  normalizeVietnameseName,
  vietnameseNamesMatch,
} from '@/lib/vietnamese-name';

// ─────────────────────────────────────────────────────────────────────────────
// normalizeVietnameseName
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeVietnameseName', () => {
  it('lowercases and strips diacritics from a typical Vietnamese name', () => {
    expect(normalizeVietnameseName('Nguyễn Thị Thủy')).toBe('nguyen thi thuy');
  });

  it('handles fully uppercased input', () => {
    expect(normalizeVietnameseName('NGUYỄN THỊ THỦY')).toBe('nguyen thi thuy');
  });

  it('handles fully lowercased input', () => {
    expect(normalizeVietnameseName('nguyễn thị thủy')).toBe('nguyen thi thuy');
  });

  it('collapses multiple spaces between name components', () => {
    expect(normalizeVietnameseName('Nguyễn   Thị   Thủy')).toBe('nguyen thi thuy');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeVietnameseName('  Nguyễn Thị Thủy  ')).toBe('nguyen thi thuy');
  });

  it('handles Thủy vs Thuỷ (tone on u vs y)', () => {
    // Both should reduce to the same stripped form.
    const a = normalizeVietnameseName('Thủy');
    const b = normalizeVietnameseName('Thuỷ');
    expect(a).toBe('thuy');
    expect(b).toBe('thuy');
    expect(a).toBe(b);
  });

  it('handles đ/Đ correctly (not decomposed by NFD)', () => {
    expect(normalizeVietnameseName('Đặng Văn Đức')).toBe('dang van duc');
  });

  it('normalizes NFC and NFD representations identically', () => {
    // NFC: ủ as single precomposed character U+1EE7
    const nfc = 'Th\u1ee7y';
    // NFD: u + combining hook above U+0309 + y
    const nfd = 'Thu\u0309y';
    expect(normalizeVietnameseName(nfc)).toBe(normalizeVietnameseName(nfd));
  });

  it('returns empty string for empty input (after trim)', () => {
    expect(normalizeVietnameseName('')).toBe('');
    expect(normalizeVietnameseName('   ')).toBe('');
  });

  it('handles plain ASCII names without diacritics', () => {
    expect(normalizeVietnameseName('John Doe')).toBe('john doe');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// vietnameseNamesMatch
// ─────────────────────────────────────────────────────────────────────────────

describe('vietnameseNamesMatch', () => {
  // ─── Positive matches ───────────────────────────────────────────────────

  it('matches exact same name', () => {
    expect(vietnameseNamesMatch('Nguyễn Thị Thủy', 'Nguyễn Thị Thủy')).toBe(true);
  });

  it('matches case-insensitively (mixed case)', () => {
    expect(vietnameseNamesMatch('Nguyễn Thị Thủy', 'nguyễn thị thủy')).toBe(true);
  });

  it('matches case-insensitively (all uppercase)', () => {
    expect(vietnameseNamesMatch('Nguyễn Thị Thủy', 'NGUYỄN THỊ THỦY')).toBe(true);
  });

  it('matches Thủy ↔ Thuỷ (tone mark placement variant)', () => {
    expect(vietnameseNamesMatch('Nguyễn Thị Thủy', 'Nguyễn Thị Thuỷ')).toBe(true);
  });

  it('matches with combined case + diacritic differences', () => {
    expect(vietnameseNamesMatch('Nguyễn Thị Thủy', 'NGUYỄN THỊ THUỶ')).toBe(true);
  });

  it('matches with leading/trailing whitespace', () => {
    expect(vietnameseNamesMatch('  Nguyễn Thị Thủy  ', 'Nguyễn Thị Thủy')).toBe(true);
  });

  it('matches with multiple spaces between components', () => {
    expect(vietnameseNamesMatch('Nguyễn  Thị  Thủy', 'Nguyễn Thị Thủy')).toBe(true);
  });

  it('matches with combined whitespace + case + diacritics', () => {
    expect(vietnameseNamesMatch('  nguyễn   thị   thuỷ  ', 'NGUYỄN THỊ THỦY')).toBe(true);
  });

  it('matches Đặng with different cases', () => {
    expect(vietnameseNamesMatch('Đặng Văn Đức', 'đặng văn đức')).toBe(true);
  });

  // ─── Negative matches (must NOT match) ──────────────────────────────────

  it('does not match clearly different names', () => {
    expect(vietnameseNamesMatch('Nguyễn Thị Thủy', 'Nguyễn Thị Hủy')).toBe(false);
  });

  it('does not match different family names', () => {
    expect(vietnameseNamesMatch('Nguyễn Thị Thủy', 'Trần Thị Thủy')).toBe(false);
  });

  it('does not match when a name component is missing', () => {
    expect(vietnameseNamesMatch('Nguyễn Thị Thủy', 'Nguyễn Thủy')).toBe(false);
  });

  it('does not match completely different names', () => {
    expect(vietnameseNamesMatch('Nguyễn Thị Thủy', 'Lê Văn Hùng')).toBe(false);
  });

  it('does not match reversed name order', () => {
    expect(vietnameseNamesMatch('Nguyễn Thị Thủy', 'Thủy Thị Nguyễn')).toBe(false);
  });

  // ─── Edge cases ─────────────────────────────────────────────────────────

  it('handles empty strings', () => {
    expect(vietnameseNamesMatch('', '')).toBe(true);
    expect(vietnameseNamesMatch('Nguyễn', '')).toBe(false);
    expect(vietnameseNamesMatch('', 'Nguyễn')).toBe(false);
  });

  it('handles whitespace-only strings', () => {
    expect(vietnameseNamesMatch('   ', '')).toBe(true);
    expect(vietnameseNamesMatch('   ', '   ')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: name belonging to a different inmate must not match
// ─────────────────────────────────────────────────────────────────────────────
// This is an integration/service-level concern (the DB query scopes by
// inmate_id), but we verify here that the name comparison function itself
// does NOT produce false matches for genuinely different names.

describe('cross-inmate isolation (name-level)', () => {
  it('same name matches itself (would match for the correct inmate)', () => {
    expect(vietnameseNamesMatch('Trần Thị Mai', 'Trần Thị Mai')).toBe(true);
  });

  it('different name does not match (would fail for the wrong inmate)', () => {
    expect(vietnameseNamesMatch('Trần Thị Mai', 'Lê Thị Lan')).toBe(false);
  });
});
