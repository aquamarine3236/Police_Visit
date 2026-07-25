import { describe, it, expect } from 'vitest';
import {
  VN_TIMEZONE,
  todayVN,
  getISODayOfWeekVN,
  getWeekdayNameVN,
  compareISODate,
  isFutureDateVN,
  isPastDateVN,
  hasSlotEndedVN,
  calendarDateToISO,
  formatDateTimeVN,
} from '@/lib/time';

describe('VN_TIMEZONE', () => {
  it('là Asia/Ho_Chi_Minh', () => {
    expect(VN_TIMEZONE).toBe('Asia/Ho_Chi_Minh');
  });
});

describe('todayVN — ranh giới ngày theo UTC+7', () => {
  it('trước 17:00 UTC vẫn là cùng ngày UTC', () => {
    // 2026-07-14T09:00Z -> 16:00 VN -> 2026-07-14
    const now = new Date('2026-07-14T09:00:00Z');
    expect(todayVN(now)).toBe('2026-07-14');
  });

  it('từ 17:00 UTC trở đi đã sang ngày hôm sau ở VN', () => {
    // 2026-07-14T17:00Z -> 00:00 VN ngày 15 -> 2026-07-15
    const now = new Date('2026-07-14T17:00:00Z');
    expect(todayVN(now)).toBe('2026-07-15');
  });

  it('16:59 UTC vẫn còn là ngày 14 ở VN', () => {
    // 2026-07-14T16:59Z -> 23:59 VN ngày 14
    const now = new Date('2026-07-14T16:59:00Z');
    expect(todayVN(now)).toBe('2026-07-14');
  });

  it('nửa đêm UTC là 07:00 sáng cùng ngày ở VN', () => {
    const now = new Date('2026-07-14T00:00:00Z');
    expect(todayVN(now)).toBe('2026-07-14');
  });
});

describe('getISODayOfWeekVN', () => {
  it('2026-07-14 là Thứ Ba (ISO 2)', () => {
    expect(getISODayOfWeekVN('2026-07-14')).toBe(2);
  });

  it('2026-07-17 là Thứ Sáu (ISO 5)', () => {
    expect(getISODayOfWeekVN('2026-07-17')).toBe(5);
  });

  it('2026-07-19 là Chủ Nhật (ISO 7)', () => {
    expect(getISODayOfWeekVN('2026-07-19')).toBe(7);
  });

  it('bỏ qua phần giờ nếu là timestamp', () => {
    expect(getISODayOfWeekVN('2026-07-17T23:00:00Z')).toBe(5);
  });

  it('trả 0 khi chuỗi không hợp lệ', () => {
    expect(getISODayOfWeekVN('abc')).toBe(0);
  });
});

describe('getWeekdayNameVN', () => {
  it('trả tên thứ tiếng Việt', () => {
    expect(getWeekdayNameVN('2026-07-14')).toBe('Thứ Ba');
    expect(getWeekdayNameVN('2026-07-17')).toBe('Thứ Sáu');
    expect(getWeekdayNameVN('2026-07-19')).toBe('Chủ Nhật');
  });

  it('trả rỗng khi ngày không hợp lệ', () => {
    expect(getWeekdayNameVN('')).toBe('');
  });
});

describe('compareISODate', () => {
  it('so sánh đúng thứ tự', () => {
    expect(compareISODate('2026-07-14', '2026-07-15')).toBeLessThan(0);
    expect(compareISODate('2026-07-15', '2026-07-14')).toBeGreaterThan(0);
    expect(compareISODate('2026-07-14', '2026-07-14')).toBe(0);
  });

  it('bỏ phần giờ khi so sánh', () => {
    expect(compareISODate('2026-07-14T23:00:00Z', '2026-07-14')).toBe(0);
  });
});

describe('isFutureDateVN / isPastDateVN — dùng mốc "now" cố định', () => {
  // Cố định "bây giờ" = 2026-07-14T09:00Z (=> hôm nay VN = 2026-07-14).
  const now = new Date('2026-07-14T09:00:00Z');

  it('hôm nay KHÔNG phải tương lai và KHÔNG phải quá khứ', () => {
    expect(isFutureDateVN('2026-07-14', now)).toBe(false);
    expect(isPastDateVN('2026-07-14', now)).toBe(false);
  });

  it('ngày mai là tương lai', () => {
    expect(isFutureDateVN('2026-07-15', now)).toBe(true);
    expect(isPastDateVN('2026-07-15', now)).toBe(false);
  });

  it('hôm qua là quá khứ', () => {
    expect(isPastDateVN('2026-07-13', now)).toBe(true);
    expect(isFutureDateVN('2026-07-13', now)).toBe(false);
  });

  it('ranh giới: 17:00 UTC đã sang ngày mai VN nên "15" thành hôm nay', () => {
    const nowBoundary = new Date('2026-07-14T17:00:00Z'); // VN = 2026-07-15
    expect(isFutureDateVN('2026-07-15', nowBoundary)).toBe(false);
    expect(isPastDateVN('2026-07-14', nowBoundary)).toBe(true);
  });

  it('chuỗi không hợp lệ trả false', () => {
    expect(isFutureDateVN('xyz', now)).toBe(false);
    expect(isPastDateVN('xyz', now)).toBe(false);
  });
});

describe('hasSlotEndedVN — kết thúc khung giờ thăm gặp theo UTC+7', () => {
  // Cố định "bây giờ" = 2026-07-14T08:00Z (=> 15:00 VN, ngày 2026-07-14).
  const now = new Date('2026-07-14T08:00:00Z');

  it('cùng ngày, khung giờ đã kết thúc trước giờ hiện tại -> true', () => {
    // Kết thúc 11:00 VN, hiện tại 15:00 VN.
    expect(hasSlotEndedVN('2026-07-14', '11:00', now)).toBe(true);
    expect(hasSlotEndedVN('2026-07-14', '11:00:00', now)).toBe(true);
  });

  it('cùng ngày, khung giờ chưa kết thúc -> false', () => {
    // Kết thúc 16:30 VN, hiện tại 15:00 VN.
    expect(hasSlotEndedVN('2026-07-14', '16:30', now)).toBe(false);
  });

  it('cùng ngày, đúng thời điểm kết thúc (biên) -> true', () => {
    // Kết thúc 15:00 VN, hiện tại 15:00 VN => coi như đã hết.
    expect(hasSlotEndedVN('2026-07-14', '15:00', now)).toBe(true);
  });

  it('cùng ngày, kết thúc trễ hơn hiện tại 1 phút -> false', () => {
    expect(hasSlotEndedVN('2026-07-14', '15:01', now)).toBe(false);
  });

  it('ngày quá khứ -> true bất kể giờ', () => {
    expect(hasSlotEndedVN('2026-07-13', '23:59', now)).toBe(true);
    expect(hasSlotEndedVN('2026-07-13', '00:00', now)).toBe(true);
  });

  it('ngày tương lai -> false bất kể giờ', () => {
    expect(hasSlotEndedVN('2026-07-15', '00:00', now)).toBe(false);
    expect(hasSlotEndedVN('2026-07-15', '23:59', now)).toBe(false);
  });

  it('ranh giới ngày VN: 17:00 UTC đã là ngày 15 ở VN', () => {
    const nowBoundary = new Date('2026-07-14T17:00:00Z'); // 00:00 VN ngày 15
    // Ngày thăm 14 đã hoàn toàn qua.
    expect(hasSlotEndedVN('2026-07-14', '23:59', nowBoundary)).toBe(true);
    // Ngày thăm 15, khung giờ 08:00 chưa tới (mới 00:00 VN).
    expect(hasSlotEndedVN('2026-07-15', '08:00', nowBoundary)).toBe(false);
  });

  it('đầu vào không hợp lệ -> false', () => {
    expect(hasSlotEndedVN('xyz', '11:00', now)).toBe(false);
    expect(hasSlotEndedVN('2026-07-14', 'bad', now)).toBe(false);
  });
});

describe('calendarDateToISO', () => {
  it('đọc đúng Y/M/D theo giờ tường (local) của Date lịch', () => {
    // Tạo Date theo local wall-clock (giống react-day-picker).
    const d = new Date(2026, 6, 14); // tháng 6 = July (0-based)
    expect(calendarDateToISO(d)).toBe('2026-07-14');
  });
});

describe('formatDateTimeVN (re-export qua time.ts)', () => {
  it('08:05 UTC -> 15:05 VN', () => {
    expect(formatDateTimeVN('2026-07-14T08:05:00Z')).toBe('14/07/2026 15:05');
  });
});
