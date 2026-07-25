/**
 * Module thời gian dùng chung cho TOÀN hệ thống.
 *
 * Nguyên tắc:
 * - Timezone nghiệp vụ DUY NHẤT là UTC+7 (Asia/Ho_Chi_Minh). Mọi khái niệm
 *   "hôm nay", "ngày thăm", "quá khứ/tương lai", giờ hiển thị… đều tính theo +7,
 *   độc lập với timezone của server (Vercel chạy UTC) hay của trình duyệt.
 * - Lưu trữ / truyền tải giữ nguyên: ngày dạng ISO `yyyy-mm-dd`, timestamp là
 *   `timestamptz` (UTC nội bộ). Chỉ khi HIỂN THỊ hoặc SO SÁNH NGHIỆP VỤ mới
 *   quy đổi sang +7 tại đây.
 * - Không phụ thuộc thư viện ngoài: dùng `Intl.DateTimeFormat` với
 *   `timeZone: 'Asia/Ho_Chi_Minh'` để lấy đúng các thành phần ngày/giờ ở +7.
 */

/** Timezone nghiệp vụ duy nhất của hệ thống. */
export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh' as const;

// ─── Helpers nội bộ ───────────────────────────────────────────────────────────

interface VNParts {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  hour: number; // 0–23
  minute: number; // 0–59
  second: number; // 0–59
  /** ISO day-of-week: 1 = Thứ Hai … 7 = Chủ Nhật. */
  isoDayOfWeek: number;
}

const JS_DAY_TO_ISO: Record<string, number> = {
  Sun: 7,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Tách một `Date` (thời điểm tuyệt đối) thành các thành phần ngày/giờ theo +7.
 */
function getVNParts(date: Date): VNParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: VN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  let hour = Number(get('hour'));
  // Intl có thể trả "24" cho nửa đêm ở một số môi trường — chuẩn hóa về 0.
  if (hour === 24) hour = 0;

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour,
    minute: Number(get('minute')),
    second: Number(get('second')),
    isoDayOfWeek: JS_DAY_TO_ISO[get('weekday')] ?? 0,
  };
}

/** Parse chuỗi ngày `yyyy-mm-dd` (bỏ phần giờ nếu là timestamp) thành số. */
function parseISODateString(
  value: string,
): { year: number; month: number; day: number } | null {
  const datePart = value.split('T')[0];
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** Ghép số ngày thành chuỗi ISO `yyyy-mm-dd`. */
function toISODate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── API công khai ─────────────────────────────────────────────────────────────

/**
 * Ngày "hôm nay" theo UTC+7, dạng ISO `yyyy-mm-dd`.
 *
 * Dùng cho mọi so sánh nghiệp vụ ("tương lai/quá khứ", giới hạn theo tháng…)
 * thay cho `new Date().toISOString()` (vốn theo UTC → lệch ngày trước 07:00 VN).
 */
export function todayVN(now: Date = new Date()): string {
  const p = getVNParts(now);
  return toISODate(p.year, p.month, p.day);
}

/**
 * ISO day-of-week (1 = Thứ Hai … 7 = Chủ Nhật) của một ngày `yyyy-mm-dd`,
 * tính theo lịch UTC+7. Ổn định bất kể timezone server/trình duyệt.
 */
export function getISODayOfWeekVN(dateStr: string): number {
  const parsed = parseISODateString(dateStr);
  if (!parsed) return 0;
  // Neo vào 12:00 UTC để tránh mọi rủi ro lệch ngày khi quy đổi sang +7.
  const anchor = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0),
  );
  return getVNParts(anchor).isoDayOfWeek;
}

/**
 * So sánh chuỗi ngày ISO. Trả về:
 *  <0 nếu a < b, 0 nếu bằng, >0 nếu a > b.
 * So sánh trên chuỗi `yyyy-mm-dd` là an toàn theo thứ tự từ điển.
 */
export function compareISODate(a: string, b: string): number {
  const da = a.split('T')[0];
  const db = b.split('T')[0];
  return da < db ? -1 : da > db ? 1 : 0;
}

/**
 * `dateStr` có phải NGÀY TRONG TƯƠNG LAI (nghiêm ngặt, không gồm hôm nay) theo +7?
 */
export function isFutureDateVN(dateStr: string, now: Date = new Date()): boolean {
  const parsed = parseISODateString(dateStr);
  if (!parsed) return false;
  return compareISODate(toISODate(parsed.year, parsed.month, parsed.day), todayVN(now)) > 0;
}

/**
 * `dateStr` có phải NGÀY TRONG QUÁ KHỨ (nghiêm ngặt, không gồm hôm nay) theo +7?
 */
export function isPastDateVN(dateStr: string, now: Date = new Date()): boolean {
  const parsed = parseISODateString(dateStr);
  if (!parsed) return false;
  return compareISODate(toISODate(parsed.year, parsed.month, parsed.day), todayVN(now)) < 0;
}

/** Parse chuỗi giờ `HH:mm` hoặc `HH:mm:ss` thành phút trong ngày (0–1439). */
function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * Khung giờ thăm gặp (kết thúc tại `timeSlotEnd`) đã TRÔI QUA theo giờ VN (+7)?
 *
 * Ghép `visitDate` (`yyyy-mm-dd`) với `timeSlotEnd` (`HH:mm[:ss]`) thành một mốc
 * thời gian tường (wall-clock) ở +7, rồi so sánh với "bây giờ" cũng quy về +7.
 * Trả về `true` khi thời điểm hiện tại ĐÃ vượt qua thời điểm kết thúc khung giờ.
 *
 * Dùng cho nghiệp vụ "chỉ cho cập nhật trạng thái (Hoàn thành / Vắng mặt) sau
 * khi kết thúc thời gian thăm gặp" — cho phép ngay trong ngày thăm một khi khung
 * giờ được phân đã hết, độc lập với timezone server/trình duyệt.
 */
export function hasSlotEndedVN(
  visitDate: string,
  timeSlotEnd: string,
  now: Date = new Date(),
): boolean {
  const parsedDate = parseISODateString(visitDate);
  const endMinutes = parseTimeToMinutes(timeSlotEnd);
  if (!parsedDate || endMinutes === null) return false;

  const nowParts = getVNParts(now);
  const nowDateStr = toISODate(nowParts.year, nowParts.month, nowParts.day);
  const visitDateStr = toISODate(parsedDate.year, parsedDate.month, parsedDate.day);

  const cmp = compareISODate(nowDateStr, visitDateStr);
  if (cmp < 0) return false; // hôm nay vẫn trước ngày thăm → chưa tới.
  if (cmp > 0) return true; // đã sang ngày sau ngày thăm → chắc chắn đã qua.

  // Cùng ngày thăm: so sánh phút hiện tại với phút kết thúc khung giờ.
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;
  return nowMinutes >= endMinutes;
}

/**
 * Lấy tên thứ trong tuần (tiếng Việt) của một ngày `yyyy-mm-dd` theo lịch +7.
 * Ví dụ: "Thứ Hai", "Chủ Nhật".
 */
export function getWeekdayNameVN(dateStr: string): string {
  const iso = getISODayOfWeekVN(dateStr); // 1..7 (Mon..Sun)
  if (iso < 1 || iso > 7) return '';
  // index theo ISO: 1=Thứ Hai … 7=Chủ Nhật
  const names = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
  return names[iso - 1];
}

/**
 * Chuyển một đối tượng `Date` do lịch (react-day-picker) tạo ra — vốn biểu diễn
 * ngày theo GIỜ TƯỜNG (wall-clock) cục bộ — thành chuỗi ISO `yyyy-mm-dd` dựa
 * trên đúng các thành phần năm/tháng/ngày mà người dùng nhìn thấy.
 *
 * Không dùng `toISOString()` (sẽ quy về UTC và lệch ngày), mà đọc trực tiếp các
 * getter cục bộ để giữ đúng ô ngày người dùng bấm.
 */
export function calendarDateToISO(date: Date): string {
  return toISODate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * Định dạng timestamp ISO sang `dd/mm/yyyy HH:mm` theo giờ VN (+7).
 * Nếu đầu vào chỉ là ngày `yyyy-mm-dd` sẽ hiển thị `00:00`.
 *
 * @returns Chuỗi `dd/mm/yyyy HH:mm`, hoặc rỗng nếu đầu vào rỗng, hoặc trả lại
 *          nguyên bản nếu không parse được.
 */
export function formatDateTimeVN(value: string | null | undefined): string {
  if (!value) return '';

  const d = new Date(value);
  if (isNaN(d.getTime())) return value;

  const p = getVNParts(d);
  const dd = String(p.day).padStart(2, '0');
  const mm = String(p.month).padStart(2, '0');
  const hh = String(p.hour).padStart(2, '0');
  const min = String(p.minute).padStart(2, '0');

  return `${dd}/${mm}/${p.year} ${hh}:${min}`;
}
