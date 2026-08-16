import { defineConfig, devices } from '@playwright/test';

/**
 * Specs only. Browsers come from the shared Playwright MCP / host install.
 * Do not run `playwright install` in this repo.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://127.0.0.1:4200',
    trace: 'on-first-retry',
    /* Host Chrome via MCP / system; never `playwright install` in this repo. */
    channel: 'chrome',
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
