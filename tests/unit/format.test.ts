import { describe, it, expect } from 'vitest';
import {
  formatDateVN,
  formatDateTimeVN,
  parseDateVNtoISO,
  isValidDateVN,
  toTitleCaseName,
} from '@/lib/format';

describe('formatDateVN', () => {
  it('chuyển ISO yyyy-mm-dd sang dd/mm/yyyy', () => {
    expect(formatDateVN('2026-07-14')).toBe('14/07/2026');
    expect(formatDateVN('1985-03-20')).toBe('20/03/1985');
  });

  it('lấy phần ngày từ timestamp ISO', () => {
    expect(formatDateVN('2026-07-14T08:30:00Z')).toBe('14/07/2026');
  });

  it('trả về rỗng khi đầu vào rỗng/null/undefined', () => {
    expect(formatDateVN('')).toBe('');
    expect(formatDateVN(null)).toBe('');
    expect(formatDateVN(undefined)).toBe('');
  });

  it('trả về nguyên bản khi không đúng định dạng ISO', () => {
    expect(formatDateVN('14/07/2026')).toBe('14/07/2026');
  });
});

describe('formatDateTimeVN', () => {
  it('chuyển timestamp ISO sang dd/mm/yyyy HH:mm', () => {
    // Dùng giờ địa phương; tạo Date rồi so lại theo cùng logic.
    const iso = '2026-07-14T08:05:00';
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    expect(formatDateTimeVN(iso)).toBe(`${dd}/${mm}/${yyyy} ${hh}:${min}`);
  });

  it('trả về rỗng khi đầu vào rỗng', () => {
    expect(formatDateTimeVN('')).toBe('');
    expect(formatDateTimeVN(null)).toBe('');
  });
});

describe('parseDateVNtoISO', () => {
  it('chuyển dd/mm/yyyy sang ISO', () => {
    expect(parseDateVNtoISO('14/07/2026')).toBe('2026-07-14');
    expect(parseDateVNtoISO('5/3/1985')).toBe('1985-03-05');
  });

  it('trả về rỗng cho ngày không hợp lệ', () => {
    expect(parseDateVNtoISO('31/02/2020')).toBe('');
    expect(parseDateVNtoISO('32/01/2020')).toBe('');
    expect(parseDateVNtoISO('01/13/2020')).toBe('');
  });

  it('trả về rỗng cho chuỗi sai định dạng/rỗng', () => {
    expect(parseDateVNtoISO('2020-01-01')).toBe('');
    expect(parseDateVNtoISO('abc')).toBe('');
    expect(parseDateVNtoISO('')).toBe('');
  });
});

describe('isValidDateVN', () => {
  it('nhận biết ngày hợp lệ và không hợp lệ', () => {
    expect(isValidDateVN('29/02/2024')).toBe(true); // năm nhuận
    expect(isValidDateVN('29/02/2023')).toBe(false); // không nhuận
    expect(isValidDateVN('14/07/2026')).toBe(true);
  });
});

describe('toTitleCaseName', () => {
  it('viết hoa chữ cái đầu mỗi từ', () => {
    expect(toTitleCaseName('nguyễn văn an')).toBe('Nguyễn Văn An');
    expect(toTitleCaseName('TRẦN THỊ MAI')).toBe('Trần Thị Mai');
  });

  it('gộp khoảng trắng thừa và cắt đầu/cuối', () => {
    expect(toTitleCaseName('  nGuyễn   văn  an ')).toBe('Nguyễn Văn An');
  });

  it('giữ nguyên dấu tiếng Việt', () => {
    expect(toTitleCaseName('lê hoàng phúc')).toBe('Lê Hoàng Phúc');
  });

  it('trả về rỗng khi đầu vào rỗng', () => {
    expect(toTitleCaseName('')).toBe('');
    expect(toTitleCaseName(null)).toBe('');
    expect(toTitleCaseName(undefined)).toBe('');
  });
});
