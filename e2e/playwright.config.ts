import { defineConfig, devices } from '@playwright/test';

/**
 * Browsers come from the shared Playwright MCP / host Chrome install.
 * Do not run `playwright install` in this repo.
 * Mobile/tablet use Chromium + Chrome channel (iPad preset is WebKit and cannot use channel chrome).
 */
export default defineConfig({
  testDir: './',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://127.0.0.1:4200',
    trace: 'on-first-retry',
    channel: 'chrome',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], browserName: 'chromium', channel: 'chrome' },
    },
    {
      name: 'tablet',
      use: {
        browserName: 'chromium',
        channel: 'chrome',
        viewport: { width: 834, height: 1194 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
});
