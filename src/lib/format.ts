/**
 * Định dạng ngày & họ tên dùng chung cho toàn UI/UX (admin + public).
 *
 * Quy ước:
 * - Ngày lưu trong DB / truyền qua API ở dạng ISO `yyyy-mm-dd`.
 * - Ngày HIỂN THỊ luôn ở dạng `dd/mm/yyyy` (toàn số).
 * - Họ tên HIỂN THỊ viết hoa chữ cái đầu mỗi từ (Title Case), giữ nguyên dấu.
 *   Lưu ý: chỉ chuẩn hóa khi hiển thị, KHÔNG thay đổi dữ liệu lưu trong DB.
 */

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
 * Chuyển timestamp ISO sang `dd/mm/yyyy HH:mm` (giờ địa phương VN).
 *
 * @param value Timestamp ISO (ví dụ `2026-07-14T08:30:00Z`).
 * @returns Chuỗi `dd/mm/yyyy HH:mm`, hoặc rỗng nếu đầu vào rỗng/không hợp lệ.
 */
export function formatDateTimeVN(value: string | null | undefined): string {
  if (!value) return '';

  const d = new Date(value);
  if (isNaN(d.getTime())) return value;

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');

  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
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
