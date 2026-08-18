import { expect, test } from '@playwright/test';

import { gotoHomeReady } from './consent.po';

test.describe('responsive rendering', () => {
  test('footer and header stay on one line at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 772 });
    await gotoHomeReady(page);
    await expect(page.getByRole('heading', { name: 'Gregory Roussac' })).toBeVisible();

    const layout = await page.evaluate(() => {
      const footer = document.querySelector('.site-footer');
      const header = document.querySelector('.site-header');
      const logo = document.querySelector('.card-logo');
      const avatar = document.querySelector('.avatar img');
      const footerWraps = footer ? footer.scrollHeight > footer.clientHeight + 1 : true;
      const headerWraps = header ? header.scrollHeight > header.clientHeight + 1 : true;
      let avatarBelowLogo = true;
      let logoBelowHeader = true;
      if (logo && avatar) {
        avatarBelowLogo =
          avatar.getBoundingClientRect().top >= logo.getBoundingClientRect().bottom - 2;
      }
      const headerRect = header?.getBoundingClientRect();
      const logoRect = logo?.getBoundingClientRect();
      if (headerRect && logoRect) {
        logoBelowHeader = logoRect.top >= headerRect.bottom - 2;
      }
      return { footerWraps, headerWraps, avatarBelowLogo, logoBelowHeader };
    });

    expect(layout.footerWraps, 'footer must not wrap at 320px').toBe(false);
    expect(layout.headerWraps, 'header must not wrap at 320px').toBe(false);
    expect(layout.avatarBelowLogo, 'avatar must not overlap hanging logo at 320px').toBe(true);
    expect(layout.logoBelowHeader, 'card logo must not overlap site header at 320px').toBe(true);

    const footerStyle = await page.evaluate(() => {
      const footerHost = document.querySelector('app-site-footer');
      const footer = document.querySelector('app-site-footer .site-footer');
      if (!footer || !footerHost) {
        return null;
      }
      const rect = footer.getBoundingClientRect();
      const style = getComputedStyle(footer);
      return {
        textAlign: style.textAlign,
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight,
        visible: rect.bottom > 0 && rect.top < window.innerHeight,
      };
    });
    expect(footerStyle?.textAlign).toBe('center');
    expect(footerStyle?.visible, 'footer must be visible in the viewport at 320px').toBe(true);
    expect(footerStyle?.bottom ?? 0).toBeGreaterThanOrEqual((footerStyle?.viewportHeight ?? 0) - 2);
    expect(footerStyle?.bottom ?? 0).toBeLessThanOrEqual((footerStyle?.viewportHeight ?? 0) + 1);
  });

  test('home card is centered and footer sits at viewport bottom on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHomeReady(page);
    await expect(page.getByRole('heading', { name: 'Gregory Roussac' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Cookie consent' })).toHaveCount(0);
    await page.waitForTimeout(1500);

    const layout = await page.evaluate(() => {
      const host = document.querySelector('app-home-page');
      const card = document.querySelector('.card');
      const footer = document.querySelector('.site-footer');
      const chat = document.querySelector('.chat-fab-dock');
      const hostStyle = host ? getComputedStyle(host) : null;
      const cardRect = card?.getBoundingClientRect();
      const footerRect = footer?.getBoundingClientRect();
      const chatRect = chat?.getBoundingClientRect();
      const vh = window.innerHeight;
      const cardCenter = cardRect ? (cardRect.top + cardRect.bottom) / 2 : 0;
      return {
        hostDisplay: hostStyle?.display,
        cardOffCenter: Math.abs(cardCenter - vh / 2),
        footerBottomGap: footerRect ? vh - footerRect.bottom : 999,
        chatVisible: chatRect ? chatRect.bottom <= vh + 1 && chatRect.top < vh : false,
      };
    });

    expect(layout.hostDisplay, 'home host must use grid layout').toBe('grid');
    expect(layout.cardOffCenter, 'card should be near vertical center').toBeLessThan(48);
    expect(layout.footerBottomGap, 'footer should sit at viewport bottom').toBeLessThan(4);
    expect(layout.chatVisible, 'chat FAB should be visible').toBe(true);
  });

  test('home layout on tablet keeps footer at bottom and shows chat', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 960 });
    await gotoHomeReady(page);
    await expect(page.getByRole('heading', { name: 'Gregory Roussac' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Cookie consent' })).toHaveCount(0);
    await page.waitForTimeout(1500);

    const layout = await page.evaluate(() => {
      const host = document.querySelector('app-home-page');
      const card = document.querySelector('.card');
      const footer = document.querySelector('.site-footer');
      const chat = document.querySelector('.chat-fab-dock');
      const hostStyle = host ? getComputedStyle(host) : null;
      const cardRect = card?.getBoundingClientRect();
      const footerRect = footer?.getBoundingClientRect();
      const chatRect = chat?.getBoundingClientRect();
      const vh = window.innerHeight;
      const cardCenter = cardRect ? (cardRect.top + cardRect.bottom) / 2 : 0;
      return {
        hostDisplay: hostStyle?.display,
        cardOffCenter: Math.abs(cardCenter - vh / 2),
        footerBottomGap: footerRect ? vh - footerRect.bottom : 999,
        chatVisible: chatRect ? chatRect.bottom <= vh + 1 && chatRect.top < vh : false,
      };
    });

    expect(layout.hostDisplay, 'home host must use grid layout on tablet').toBe('grid');
    expect(layout.cardOffCenter, 'card should be near vertical center on tablet').toBeLessThan(56);
    expect(layout.footerBottomGap, 'footer should sit at viewport bottom on tablet').toBeLessThan(
      4,
    );
    expect(layout.chatVisible, 'chat FAB should be visible on tablet').toBe(true);
  });

  test('home layout holds on common phone and tablet presets', async ({ page }) => {
    const presets: Array<[number, number, string]> = [
      [375, 667, 'iPhone SE'],
      [412, 915, 'Pixel 7'],
      [600, 960, 'Nexus 7'],
      [768, 1024, 'iPad Mini'],
      [820, 1180, 'iPad Air'],
    ];

    for (const [width, height, label] of presets) {
      await page.setViewportSize({ width, height });
      await gotoHomeReady(page);
      await expect(page.getByRole('heading', { name: 'Gregory Roussac' })).toBeVisible();
      await page.waitForTimeout(1200);

      const layout = await page.evaluate(() => {
        const host = document.querySelector('app-home-page');
        const footerHost = document.querySelector('app-site-footer');
        const footer = document.querySelector('.site-footer');
        const chat = document.querySelector('.chat-fab-dock');
        const hostStyle = host ? getComputedStyle(host) : null;
        const footerHostStyle = footerHost ? getComputedStyle(footerHost) : null;
        const footerRect = footer?.getBoundingClientRect();
        const chatRect = chat?.getBoundingClientRect();
        const vh = window.innerHeight;
        return {
          hostDisplay: hostStyle?.display,
          footerPosition: footerHostStyle?.position,
          footerBottomGap: footerRect ? vh - footerRect.bottom : 999,
          footerTextAlign: footer ? getComputedStyle(footer).textAlign : '',
          chatVisible: chatRect ? chatRect.bottom <= vh + 1 && chatRect.top < vh : false,
          chatFabVisible: chatRect
            ? (() => {
                const fab = document.querySelector('.chat-fab');
                const fabRect = fab?.getBoundingClientRect();
                return fabRect ? fabRect.bottom <= vh + 1 && fabRect.top >= 0 : false;
              })()
            : false,
        };
      });

      expect(layout.hostDisplay, `${label} host layout`).toBe('grid');
      expect(layout.footerPosition, `${label} footer fixed`).toBe('fixed');
      expect(layout.footerBottomGap, `${label} footer at bottom`).toBeLessThan(4);
      expect(layout.footerTextAlign, `${label} footer centered`).toBe('center');
      expect(layout.chatFabVisible, `${label} chat FAB fully visible`).toBe(true);
    }
  });

  test('home fits viewport without horizontal overflow', async ({ page }, testInfo) => {
    await gotoHomeReady(page);
    await expect(page.getByRole('heading', { name: 'Gregory Roussac' })).toBeVisible();
    await expect(page.getByText('Rust - Wasm Freelance Developer')).toBeVisible();

    const overflowX = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflowX, `horizontal overflow on ${testInfo.project.name}`).toBe(false);

    const logoTop = await page
      .locator('.card-logo')
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(logoTop, `owl ears clipped at top on ${testInfo.project.name}`).toBeGreaterThanOrEqual(
      -1,
    );
  });

  test('document exposes a single main landmark', async ({ page }) => {
    await gotoHomeReady(page);
    await expect(page.locator('main#main')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);

    await page.goto('/CV');
    await expect(page.getByRole('main')).toHaveCount(1);
  });

  test('home icons pulse once and avatar keeps aspect ratio', async ({ page }) => {
    await gotoHomeReady(page);
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

    await expect(
      icons.locator('a[href="https://calendar.app.google/tw9hhtJkmcssZQCY7"]'),
    ).toBeVisible();

    const avatar = page.locator('.avatar img');
    const box = await avatar.boundingBox();
    expect(box).not.toBeNull();
    const src = await avatar.evaluate(async (img: HTMLImageElement) => {
      const bitmap = await createImageBitmap(img);
      return {
        srcset: (img.getAttribute('srcset') ?? '').replace(/\s+/g, ' ').trim(),
        sizes: img.getAttribute('sizes'),
        current: img.currentSrc,
        intrinsicWidth: bitmap.width,
        intrinsicHeight: bitmap.height,
      };
    });
    const ratio = box!.width / box!.height;
    const intrinsic = src.intrinsicWidth / src.intrinsicHeight;
    expect(Math.abs(ratio - intrinsic)).toBeLessThan(0.12);
    expect(src.srcset).toContain('avatar-1x.webp 200w');
    expect(src.srcset).toContain('avatar-244.webp 244w');
    expect(src.srcset).toContain('avatar-340.webp 340w');
    expect(src.srcset).toContain('avatar-2x.webp 379w');
    expect(src.sizes).toContain('30vw');
    expect(src.current).toMatch(/avatar-(1x|244|340|2x)\.webp/);
    expect(src.intrinsicWidth).toBeGreaterThanOrEqual(200);
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
