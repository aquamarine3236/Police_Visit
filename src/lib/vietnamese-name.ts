/**
 * Vietnamese name normalization utilities for tolerant name matching.
 *
 * Strategy: strip ALL diacritics (tone marks + base character marks), lowercase,
 * trim, and collapse whitespace.  This makes matching maximally tolerant of:
 *   - Case differences:      Thủy ↔ THỦY
 *   - Tone-mark placement:   Thủy ↔ Thuỷ
 *   - Unicode representations: NFC vs NFD
 *   - Extra whitespace
 *
 * The approach is safe because it is always scoped to a specific inmate's
 * approved-relatives list (max 10 entries), so the false-positive risk of
 * two genuinely different names collapsing to the same stripped form is
 * negligible in practice.
 */

/**
 * Strip all Vietnamese diacritics and normalize a name for comparison.
 *
 * Steps:
 *   1. NFD decompose (separate base chars from combining marks)
 *   2. Remove all combining diacritical marks (U+0300–U+036F)
 *   3. Replace đ/Đ with d/D (đ does not decompose via NFD)
 *   4. Lowercase
 *   5. Trim leading/trailing whitespace, collapse internal runs to single space
 *
 * @example
 * normalizeVietnameseName('Nguyễn  Thị  Thủy') // => 'nguyen thi thuy'
 * normalizeVietnameseName('NGUYỄN THỊ THUỶ')   // => 'nguyen thi thuy'
 */
export function normalizeVietnameseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip combining diacritical marks
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Check whether two Vietnamese names are equivalent after normalization.
 *
 * @returns `true` if both names reduce to the same stripped form.
 */
export function vietnameseNamesMatch(a: string, b: string): boolean {
  return normalizeVietnameseName(a) === normalizeVietnameseName(b);
}
