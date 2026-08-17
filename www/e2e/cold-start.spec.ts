import { expect, test } from '@playwright/test';

test.describe('cold-start worker', () => {
  test('home loads the worker and pings chat health', async ({ page }) => {
    const health: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/health')) {
        health.push(req.url());
      }
    });
    await page.goto('/');
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            performance.getEntriesByType('resource').some((e) => e.name.includes('cold-start.js')),
          ),
        { timeout: 8_000 },
      )
      .toBeTruthy();
    await expect
      .poll(() => health.some((url) => url.includes(':8080/health')), { timeout: 8_000 })
      .toBeTruthy();
  });
});
