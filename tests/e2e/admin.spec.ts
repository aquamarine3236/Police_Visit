import { test, expect } from '@playwright/test';

import {
  clickButtonByText,
  disableAnimations,
  mockAdminInmates,
  mockAdminRegistrations,
  mockServerAction,
} from './helpers';

/**
 * Phase 35 — E2E: Admin dashboard workflows.
 *
 * The admin area is guarded by middleware that requires a valid Supabase
 * session. Rather than provisioning real auth (which would make the suite
 * depend on external credentials and a live DB), these tests:
 *
 *  - Verify the login page: client validation + invalid-credentials error.
 *  - Verify middleware route protection (unauthenticated /admin → /admin/login).
 *
 * The admin list APIs and status-transition Server Actions are stubbed so the
 * data-driven behaviours (search/filter, table render, status update) can be
 * asserted deterministically where a session is available.
 */

test.describe('Admin login', () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
  });

  test('renders the login form', async ({ page }) => {
    await page.goto('/admin/login');

    await expect(
      page.getByRole('heading', { name: 'Đăng nhập quản trị' }),
    ).toBeVisible();
    await expect(page.getByLabel('Địa chỉ Email')).toBeVisible();
    await expect(page.getByLabel('Mật khẩu')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
  });

  test('shows client-side validation when email is empty', async ({ page }) => {
    await page.goto('/admin/login');

    await clickButtonByText(page, 'Đăng nhập');

    await expect(page.getByText('Vui lòng nhập địa chỉ email.')).toBeVisible();
  });

  test('shows client-side validation when password is empty', async ({ page }) => {
    await page.goto('/admin/login');

    await page.getByLabel('Địa chỉ Email').fill('admin@example.com');
    await clickButtonByText(page, 'Đăng nhập');

    await expect(page.getByText('Vui lòng nhập mật khẩu.')).toBeVisible();
  });

  test('surfaces an invalid-credentials error from the server', async ({ page }) => {
    // Stub the login Server Action (POST back to /admin/login) to fail.
    await mockServerAction(page, '**/admin/login', {
      success: false,
      message: 'Đăng nhập không thành công.',
    });

    await page.goto('/admin/login');

    await page.getByLabel('Địa chỉ Email').fill('wrong@example.com');
    await page.getByLabel('Mật khẩu').fill('wrong-password');
    await clickButtonByText(page, 'Đăng nhập');

    await expect(page.getByText('Đăng nhập thất bại')).toBeVisible();
    await expect(page.getByText('Đăng nhập không thành công.')).toBeVisible();
  });
});

test.describe('Admin route protection', () => {
  test('redirects unauthenticated access to /admin to the login page', async ({
    page,
  }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(
      page.getByRole('heading', { name: 'Đăng nhập quản trị' }),
    ).toBeVisible();
  });

  test('redirects unauthenticated access to /admin/inmates to login', async ({
    page,
  }) => {
    await page.goto('/admin/inmates');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('redirects unauthenticated access to /admin/settings to login', async ({
    page,
  }) => {
    await page.goto('/admin/settings');
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

/**
 * The following suite documents the intended data-driven dashboard behaviour.
 * It only runs when an authenticated admin session is provided via the
 * `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` environment variables against a live
 * backend. Without those, the tests are skipped so the default local run stays
 * green and independent of external state.
 */
const hasAdminCreds =
  !!process.env.E2E_ADMIN_EMAIL && !!process.env.E2E_ADMIN_PASSWORD;

test.describe('Admin dashboard (authenticated)', () => {
  test.skip(!hasAdminCreds, 'Requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');

  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
    await mockAdminRegistrations(page);
    await mockAdminInmates(page);

    await page.goto('/admin/login');
    await page.getByLabel('Địa chỉ Email').fill(process.env.E2E_ADMIN_EMAIL as string);
    await page.getByLabel('Mật khẩu').fill(process.env.E2E_ADMIN_PASSWORD as string);
    await clickButtonByText(page, 'Đăng nhập');
    await page.waitForURL('**/admin');
  });

  test('lists registrations and filters by search', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Danh sách đăng ký thăm gặp' }),
    ).toBeVisible();

    await expect(page.getByText('Nguyễn Văn An')).toBeVisible();

    // Search narrows the table to the matching inmate.
    await page.getByPlaceholder(/tìm/i).first().fill('Bình');
    await expect(page.getByText('Lê Văn Bình')).toBeVisible();
  });

  test('marks a confirmed registration as completed', async ({ page }) => {
    await mockServerAction(page, '**/admin', {
      success: true,
      data: { id: '11111111-aaaa-bbbb-cccc-000000000001', status: 'completed' },
    });

    await page.getByText('Nguyễn Văn An').click();
    await page.getByRole('button', { name: /hoàn thành/i }).click();

    await expect(page.getByText(/Thành công|Đã hoàn thành/)).toBeVisible();
  });
});
