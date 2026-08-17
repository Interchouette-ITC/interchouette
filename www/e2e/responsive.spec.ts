import { expect, test } from '@playwright/test';

test.describe('responsive rendering', () => {
  test('home fits viewport without horizontal overflow', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Gregory Roussac' })).toBeVisible();
    await expect(page.getByText('Rust - Wasm Freelance Developer')).toBeVisible();

    const overflowX = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflowX, `horizontal overflow on ${testInfo.project.name}`).toBe(false);
  });

  test('document exposes a single main landmark', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main#main')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);

    await page.goto('/CV');
    await expect(page.getByRole('main')).toHaveCount(1);
  });

  test('home icons pulse once and avatar keeps aspect ratio', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1600);

    const icons = page.locator('p.icons.animated.pulse');
    await expect(icons).toBeVisible();
    const iteration = await icons.evaluate((el) => getComputedStyle(el).animationIterationCount);
    expect(iteration, 'pulse must not loop forever (animate.css needs .infinite for that)').toBe(
      '1',
    );

    await expect
      .poll(async () => {
        return icons.evaluate((el) => {
          const t = getComputedStyle(el).transform;
          if (t === 'none') {
            return 1;
          }
          return new DOMMatrix(t).a;
        });
      })
      .toBeCloseTo(1, 2);

    const avatar = page.locator('.avatar img');
    const box = await avatar.boundingBox();
    expect(box).not.toBeNull();
    const ratio = box!.width / box!.height;
    expect(ratio).toBeGreaterThan(1.0);
    expect(ratio).toBeLessThan(1.2);

    const src = await avatar.evaluate((img: HTMLImageElement) => ({
      srcset: (img.getAttribute('srcset') ?? '').replace(/\s+/g, ' ').trim(),
      sizes: img.getAttribute('sizes'),
      current: img.currentSrc,
      naturalWidth: img.naturalWidth,
    }));
    expect(src.srcset).toContain('avatar-1x.webp 200w');
    expect(src.srcset).toContain('avatar-244.webp 244w');
    expect(src.srcset).toContain('avatar-340.webp 340w');
    expect(src.srcset).toContain('avatar-2x.webp 379w');
    expect(src.sizes).toContain('30vw');
    expect(src.current).toMatch(/avatar-(1x|244|340|2x)\.webp/);
    expect(src.naturalWidth).toBeGreaterThanOrEqual(200);
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
