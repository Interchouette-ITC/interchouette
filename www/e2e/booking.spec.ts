import { expect, test } from '@playwright/test';

test.describe('booking deep link', () => {
  test('direct ?booking opens chat and consumes query without reload', async ({ page }) => {
    await page.goto('/?booking');
    await expect.poll(async () => page.evaluate(() => window.location.search)).toBe('');
    await expect(page.locator('#interchouette-chat-panel')).toHaveClass(/chat-panel--open/);
  });

  test('header booking CTA opens chat and consumes query without reload', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 768, 'desktop/tablet only');

    await page.goto('/news');
    const marker = `stay-${Date.now()}`;
    await page.evaluate((value) => {
      (window as Window & { __bookingMarker?: string }).__bookingMarker = value;
    }, marker);

    const cta = page.locator('.site-header__marquee-booking');
    await expect(cta).toBeVisible({ timeout: 12_000 });
    await page.evaluate(() => {
      const el = document.querySelector<HTMLAnchorElement>('.site-header__marquee-booking');
      el?.click();
    });

    await expect(page).toHaveURL(/\/news$/);
    await expect(page.locator('#interchouette-chat-panel')).toHaveClass(/chat-panel--open/);
    await expect
      .poll(async () =>
        page.evaluate(
          () => (window as Window & { __bookingMarker?: string }).__bookingMarker ?? '',
        ),
      )
      .toBe(marker);
  });
});
