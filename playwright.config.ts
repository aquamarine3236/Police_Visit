import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for end-to-end tests (Phase 35).
 *
 * The E2E suites live in `tests/e2e/` and exercise the full client-server
 * workflows for the public visitor registration flow and the admin dashboard.
 *
 * Tests are deterministic: external network calls (public settings API, admin
 * list APIs) and Next.js Server Actions are stubbed via Playwright route
 * interception so the suite runs locally without a live Supabase database.
 */

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  // A generous per-test timeout keeps flaky socket / navigation waits from
  // failing the suite while still catching genuine hangs.
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  // The tests drive a single dev server that talks to a shared (potentially
  // slow) Supabase backend; limiting workers avoids server-side contention
  // that would otherwise cause navigation timeouts under heavy parallelism.
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Deterministic timezone so date-based slot assertions are stable.
    timezoneId: 'Asia/Ho_Chi_Minh',
    locale: 'vi-VN',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Boot a dedicated dev server for the E2E run on an isolated port so it does
  // not collide with a manually started `npm run dev` instance on 3000.
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
