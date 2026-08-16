import { expect, test } from '@playwright/test';

test.describe('responsive rendering', () => {
  test('home fits viewport without horizontal overflow', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByText('Gregory Roussac')).toBeVisible();
    await expect(page.getByText('Rust - Wasm Freelance Developer')).toBeVisible();

    const overflowX = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflowX, `horizontal overflow on ${testInfo.project.name}`).toBe(false);
  });

  test('terms and privacy stay readable', async ({ page }, testInfo) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();

    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();

    const overflowX = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflowX, `horizontal overflow on ${testInfo.project.name}`).toBe(false);
  });

  test('CV page shows summary on small and medium screens', async ({ page }) => {
    await page.goto('/CV');
    await expect(page.getByRole('heading', { name: 'Gregory Roussac' })).toBeVisible();
    await expect(page.getByText('Professional Summary')).toBeVisible();
    await expect(page.getByRole('link', { name: /Download PDF/i })).toBeVisible();
  });
});

test.describe('home icon row', () => {
  for (const width of [760, 1162] as const) {
    test(`keeps social icons on one row at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const rows = await page.evaluate(() => {
        const icons = document.querySelector('.icons.animated');
        if (!icons) return -1;
        const tops = [...icons.querySelectorAll('a')].map((a) =>
          Math.round(a.getBoundingClientRect().top),
        );
        return new Set(tops).size;
      });
      expect(rows).toBe(1);
    });
  }
});
