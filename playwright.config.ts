import { defineConfig } from '@playwright/test';

/**
 * Mostly HTTP-level: most of these checks are about status codes, headers, and
 * cookies, so they run through the request fixture without a browser. The form
 * login and session specs need a real browser context and say so.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 2,
  retries: process.env.CI ? 2 : 1,   // free dyno cold-starts
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://the-internet.herokuapp.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: false,   // TLS problems are findings, not noise to suppress
  },
});
