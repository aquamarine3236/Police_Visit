/**
 * Định dạng ngày & họ tên dùng chung cho toàn UI/UX (admin + public).
 *
 * Quy ước:
 * - Ngày lưu trong DB / truyền qua API ở dạng ISO `yyyy-mm-dd`.
 * - Ngày HIỂN THỊ luôn ở dạng `dd/mm/yyyy` (toàn số).
 * - Giờ HIỂN THỊ luôn tính theo múi giờ nghiệp vụ UTC+7 (xem `@/lib/time`).
 * - Họ tên HIỂN THỊ viết hoa chữ cái đầu mỗi từ (Title Case), giữ nguyên dấu.
 *   Lưu ý: chỉ chuẩn hóa khi hiển thị, KHÔNG thay đổi dữ liệu lưu trong DB.
 */

// Timestamp luôn hiển thị theo giờ VN (+7); nguồn chân lý duy nhất là `@/lib/time`.
// Re-export để giữ backward-compatible import `formatDateTimeVN` từ `@/lib/format`.
export { formatDateTimeVN } from '@/lib/time';

// ─── Ngày ───────────────────────────────────────────────────────────────────

/**
 * Chuyển chuỗi ISO `yyyy-mm-dd` (hoặc timestamp ISO) sang `dd/mm/yyyy`.
 * Parse thủ công phần ngày để tránh lệch múi giờ khi dùng `new Date`.
 *
 * @param value Chuỗi ngày dạng `yyyy-mm-dd` hoặc timestamp bắt đầu bằng ngày ISO.
 * @returns Chuỗi `dd/mm/yyyy`, hoặc chuỗi rỗng nếu đầu vào rỗng, hoặc trả lại
 *          nguyên bản nếu không parse được.
 */
export function formatDateVN(value: string | null | undefined): string {
  if (!value) return '';

  // Lấy phần ngày (bỏ phần giờ nếu là timestamp).
  const datePart = value.split('T')[0];
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) return value;

  const [, yyyy, mm, dd] = match;
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Chuyển chuỗi `dd/mm/yyyy` sang ISO `yyyy-mm-dd` (dùng khi submit form).
 *
 * @param value Chuỗi `dd/mm/yyyy`.
 * @returns Chuỗi ISO `yyyy-mm-dd`, hoặc chuỗi rỗng nếu không hợp lệ.
 */
export function parseDateVNtoISO(value: string | null | undefined): string {
  if (!value) return '';

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return '';

  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);

  // Kiểm tra ngày có hợp lệ thực sự (ví dụ loại 31/02/2020).
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return '';
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Kiểm tra chuỗi `dd/mm/yyyy` có phải ngày hợp lệ hay không.
 */
export function isValidDateVN(value: string | null | undefined): boolean {
  return parseDateVNtoISO(value) !== '';
}

/**
 * Cộng (hoặc trừ) số ngày vào một chuỗi ISO `yyyy-mm-dd` và trả về ISO mới.
 * Parse thủ công phần ngày để tránh lệch múi giờ khi dùng `new Date(string)`.
 *
 * @param iso Chuỗi ISO `yyyy-mm-dd` (phần ngày của timestamp cũng chấp nhận).
 * @param days Số ngày cần cộng (có thể âm để trừ).
 * @returns Chuỗi ISO `yyyy-mm-dd` sau khi cộng, hoặc `''` nếu đầu vào không hợp lệ.
 */
export function addDaysISO(
  iso: string | null | undefined,
  days: number,
): string {
  if (!iso) return '';

  const datePart = iso.split('T')[0];
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) return '';

  const [, yyyy, mm, dd] = match;
  // Dùng UTC để phép cộng ngày không bị ảnh hưởng bởi DST/múi giờ local.
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  d.setUTCDate(d.getUTCDate() + days);

  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Họ tên ──────────────────────────────────────────────────────────────────

/**
 * Chuẩn hóa họ tên để HIỂN THỊ: cắt khoảng trắng thừa, gộp khoảng trắng liên
 * tiếp, và viết hoa chữ cái đầu mỗi từ (giữ nguyên dấu tiếng Việt).
 *
 * Ví dụ: "  nGuyễn   văn  an " -> "Nguyễn Văn An".
 *
 * @param value Họ tên gốc.
 * @returns Họ tên đã chuẩn hóa, hoặc chuỗi rỗng nếu đầu vào rỗng.
 */
export function toTitleCaseName(value: string | null | undefined): string {
  if (!value) return '';

  return value
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      // Dùng spread để xử lý đúng ký tự Unicode nhiều byte.
      const chars = [...word];
      return chars[0].toLocaleUpperCase('vi-VN') + chars.slice(1).join('').toLocaleLowerCase('vi-VN');
    })
    .join(' ');
}
