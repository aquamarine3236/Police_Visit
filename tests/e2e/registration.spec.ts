import { test, expect } from '@playwright/test';

import {
  clickButtonByText,
  disableAnimations,
  mockPublicSettings,
  mockServerAction,
  nextWeekday,
  selectVisitDate,
} from './helpers';

/**
 * Phase 35 — E2E: Public visitor registration flow.
 *
 * Covers:
 *  - Loading the public form (dynamic suitable-days notice).
 *  - Client-side Zod validation error handling.
 *  - Selecting a future suitable day, entering mock inmate + visitor data,
 *    and verifying the assigned slot result on success.
 *  - Server-side business-rule error handling (e.g. overbooked / not found).
 */

test.describe('Public registration flow', () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
    await mockPublicSettings(page);
  });

  test('renders the form with the dynamic suitable-days notice', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Đăng ký lịch hẹn thăm gặp' }),
    ).toBeVisible();

    // Section headings prove the form (not the loading/error state) is shown.
    await expect(
      page.getByRole('heading', { name: 'Thông tin phạm nhân' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Danh sách người đi thăm' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Chọn ngày thăm gặp' }),
    ).toBeVisible();

    // The dynamic notice comes from the mocked public settings payload.
    await expect(
      page.getByText(
        'Lưu ý: Người dân chỉ có thể đăng ký thăm gặp vào Thứ Năm và Thứ Sáu.',
      ),
    ).toBeVisible();
  });

  test('shows client-side validation errors when submitting an empty form', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Thông tin phạm nhân' }),
    ).toBeVisible();

    await clickButtonByText(page, 'Đăng ký lịch hẹn');

    // Zod messages surface inline for required inmate + visitor fields.
    await expect(
      page.getByText('Vui lòng nhập số hiệu phạm nhân.'),
    ).toBeVisible();
    await expect(page.getByText('Vui lòng chọn ngày thăm gặp.')).toBeVisible();
  });

  test('validates the visitor citizen id length', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Thông tin phạm nhân' }),
    ).toBeVisible();

    // Fill an invalid (too short) CCCD and trigger validation.
    // (section heading omitted; placeholder presence proves the form rendered)
    await page.getByPlaceholder('Gồm 12 chữ số').fill('12345');
    await clickButtonByText(page, 'Đăng ký lịch hẹn');

    await expect(
      page.getByText('Số CCCD phải gồm đúng 12 chữ số.'),
    ).toBeVisible();
  });

  test('submits valid data and shows the assigned time slot on success', async ({
    page,
  }) => {
    const visitDate = nextWeekday(5); // next Friday (ISO 5) — a suitable day

    // Stub the submitRegistration Server Action to return a confirmed slot.
    await mockServerAction(page, '**/', {
      success: true,
      data: {
        registration: {
          id: 'abcdef12-0000-0000-0000-000000000000',
          visit_date: visitDate,
          time_slot_start: '07:30:00',
          time_slot_end: '08:00:00',
          status: 'confirmed',
        },
        visitors: [
          {
            full_name: 'Trần Thị Mai',
            citizen_id: '012345678901',
            relationship: 'Mẹ',
            display_order: 1,
          },
        ],
      },
    });

    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Thông tin phạm nhân' }),
    ).toBeVisible();

    // ── Inmate section ── (classification keeps its default "Người bị tạm giữ")
    await page.getByPlaceholder('Ví dụ: PMN12345').fill('PN-001');
    await page.getByPlaceholder('NHẬP CHỮ IN HOA CÓ DẤU').fill('Nguyễn Văn An');
    await page
      .locator('input[name="inmate.date_of_birth"]')
      .fill('1990-05-15');

    // ── Visitor section ──
    await page.getByPlaceholder('Nhập họ và tên thân nhân').fill('Trần Thị Mai');
    await page.locator('input[name="visitors.0.date_of_birth"]').fill('1985-03-20');
    await page.getByPlaceholder('Gồm 12 chữ số').fill('012345678901');
    await page.getByPlaceholder('Ví dụ: Cha, mẹ, vợ, con...').fill('Mẹ');

    // ── Visit date via the Calendar widget ──
    await selectVisitDate(page, visitDate);
    await expect(page.getByText(/Đã chọn:/)).toBeVisible();

    await clickButtonByText(page, 'Đăng ký lịch hẹn');

    // Success dialog with the assigned slot.
    await expect(
      page.getByRole('heading', { name: 'Đăng ký thành công!' }),
    ).toBeVisible();
    await expect(page.getByText('07:30 - 08:00')).toBeVisible();
    await expect(page.getByText('Khung giờ hẹn:')).toBeVisible();
  });

  test('shows a business-rule error message returned by the server', async ({
    page,
  }) => {
    // Stub the action to return an inmate-not-found business error.
    await mockServerAction(page, '**/', {
      success: false,
      message:
        'Không tìm thấy phạm nhân với số hiệu này. Vui lòng kiểm tra lại.',
    });

    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Thông tin phạm nhân' }),
    ).toBeVisible();

    await page.getByPlaceholder('Ví dụ: PMN12345').fill('PN-999');
    await page.getByPlaceholder('NHẬP CHỮ IN HOA CÓ DẤU').fill('Người Không Tồn Tại');
    await page.locator('input[name="inmate.date_of_birth"]').fill('1990-05-15');

    await page.getByPlaceholder('Nhập họ và tên thân nhân').fill('Trần Thị Mai');
    await page.locator('input[name="visitors.0.date_of_birth"]').fill('1985-03-20');
    await page.getByPlaceholder('Gồm 12 chữ số').fill('012345678901');
    await page.getByPlaceholder('Ví dụ: Cha, mẹ, vợ, con...').fill('Mẹ');

    const visitDate = nextWeekday(5);
    await selectVisitDate(page, visitDate);
    await expect(page.getByText(/Đã chọn:/)).toBeVisible();

    await clickButtonByText(page, 'Đăng ký lịch hẹn');

    await expect(page.getByText('Đăng ký không thành công')).toBeVisible();
    await expect(
      page.getByText('Không tìm thấy phạm nhân', { exact: false }),
    ).toBeVisible();
  });
});
