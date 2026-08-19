import { expect, test } from '@playwright/test';

test.describe('cold-start worker', () => {
  test('home loads the worker script', async ({ page }) => {
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
  });
});
