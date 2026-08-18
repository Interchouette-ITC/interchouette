import { expect, test } from '@playwright/test';

import { gotoHomeReady } from './consent.po';

test.describe('mobile layout at 360x664', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 664 });
  });

  test('cookie banner fits the viewport and misses the face', async ({ page }) => {
    await page.goto('/');
    const consent = page.getByRole('dialog', { name: 'Cookie consent' });
    await expect(consent).toBeVisible();
    const accept = page.getByRole('button', { name: 'Accept' });
    await expect(accept).toBeVisible();

    const layout = await page.evaluate(() => {
      const box = document.querySelector('.consent');
      const acceptBtn = document.querySelector('.consent__btn--primary');
      const avatar = document.querySelector('.avatar img');
      const name = document.querySelector('h1');
      const loc = document.querySelector('.location');
      if (!box || !acceptBtn || !avatar || !name) {
        return null;
      }
      const c = box.getBoundingClientRect();
      const a = acceptBtn.getBoundingClientRect();
      const av = avatar.getBoundingClientRect();
      const n = name.getBoundingClientRect();
      const overlap = (x: DOMRect, y: DOMRect) =>
        x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top;
      return {
        vw: window.innerWidth,
        consentRight: c.right,
        acceptRight: a.right,
        cookieOverAvatar: overlap(c, av),
        cookieOverName: overlap(c, n),
        cookieOverLocation: loc ? overlap(c, loc.getBoundingClientRect()) : false,
        boxSizing: getComputedStyle(box).boxSizing,
      };
    });

    expect(layout).not.toBeNull();
    expect(layout!.boxSizing).toBe('border-box');
    expect(layout!.consentRight, 'consent clipped on the right').toBeLessThanOrEqual(layout!.vw);
    expect(layout!.acceptRight, 'Accept clipped on the right').toBeLessThanOrEqual(layout!.vw);
    expect(layout!.cookieOverAvatar, 'cookie covers the avatar').toBe(false);
    expect(layout!.cookieOverName, 'cookie covers the name').toBe(false);
    expect(layout!.cookieOverLocation, 'cookie should cover the purple contact bar').toBe(true);
  });

  test('header hamburger keeps the brand clear and locale visible', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('app-site-header');
    const menu = header.locator('.site-header__menu-btn');
    await expect(menu).toBeVisible();
    await expect(header.locator('.site-header__lang-btn')).toHaveText('EN');
    await expect(header.getByRole('link', { name: 'News' })).toBeHidden();

    const layout = await page.evaluate(() => {
      const brand = document.querySelector('.site-header__brand');
      const tld = document.querySelector('.site-header__tld');
      const burger = document.querySelector('.site-header__menu-btn');
      const lang = document.querySelector('.site-header__lang-btn');
      if (!brand || !tld || !burger || !lang) {
        return null;
      }
      const bb = burger.getBoundingClientRect();
      const lb = lang.getBoundingClientRect();
      return {
        brandOverflows: brand.scrollWidth > brand.clientWidth + 1,
        tldRight: tld.getBoundingClientRect().right,
        burgerLeft: bb.left,
        burgerMid: bb.top + bb.height / 2,
        langMid: lb.top + lb.height / 2,
        burgerH: bb.height,
        langH: lb.height,
      };
    });

    expect(layout).not.toBeNull();
    expect(layout!.brandOverflows, 'brand text squeezed over the nav').toBe(false);
    expect(layout!.tldRight).toBeLessThan(layout!.burgerLeft);
    expect(
      Math.abs(layout!.burgerMid - layout!.langMid),
      'hamburger and locale not aligned',
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(layout!.burgerH - layout!.langH),
      'hamburger and locale height mismatch',
    ).toBeLessThanOrEqual(2);

    await menu.click();
    await expect(header.getByRole('link', { name: 'News' })).toBeVisible();
    await expect(menu).toHaveCSS('color', 'rgb(255, 210, 74)');
    await expect(header.locator('a.site-header__slack')).toBeVisible();
    await expect(header.getByRole('button', { name: 'Client login' })).toBeVisible();
  });

  test('tap highlight is off and footer is not paper white', async ({ page }) => {
    await page.goto('/');
    const paint = await page.evaluate(() => {
      const html = getComputedStyle(document.documentElement).webkitTapHighlightColor;
      const link = document.querySelector('a');
      const footer = document.querySelector('.site-footer');
      return {
        htmlTap: html,
        linkTap: link ? getComputedStyle(link).webkitTapHighlightColor : '',
        footerBg: footer ? getComputedStyle(footer).backgroundColor : '',
      };
    });

    expect(isTransparentTap(paint.htmlTap), `html tap ${paint.htmlTap}`).toBe(true);
    expect(isTransparentTap(paint.linkTap), `link tap ${paint.linkTap}`).toBe(true);
    expect(paint.footerBg).not.toBe('rgb(255, 255, 255)');
  });

  test('open chat sits below the header with expand hidden', async ({ page }) => {
    await page.goto('/');
    const consent = page.getByRole('dialog', { name: 'Cookie consent' });
    if (await consent.isVisible()) {
      await page.getByRole('button', { name: 'Decline' }).click();
    }

    const fab = page.locator('app-chat-widget').getByRole('button', { name: /Open chat/i });
    await expect(fab).toBeVisible({ timeout: 15_000 });

    const badgeLayout = await page.evaluate(() => {
      const fabEl = document.querySelector('.chat-fab');
      const badge = document.querySelector('.chat-fab__badge');
      if (!fabEl || !badge) {
        return null;
      }
      return {
        badgeTop: badge.getBoundingClientRect().top,
        fabTop: fabEl.getBoundingClientRect().top,
      };
    });
    if (badgeLayout) {
      expect(badgeLayout.badgeTop, 'status pip floats above the closed FAB').toBeGreaterThanOrEqual(
        badgeLayout.fabTop - 2,
      );
    }

    await fab.click();
    const panel = page.locator('#interchouette-chat-panel');
    await expect(panel).toHaveClass(/chat-panel--open/);
    await expect(page.locator('app-site-header')).toBeVisible();

    const chatLayout = await page.evaluate(() => {
      const header = document.querySelector('app-site-header');
      const panelEl = document.querySelector('#interchouette-chat-panel');
      const expand = document.querySelector('.chat-panel__expand');
      const close = document.querySelector('.chat-panel__close');
      const ticket = document.querySelector('.chat-panel__ticket-code');
      if (!header || !panelEl) {
        return null;
      }
      const hb = header.getBoundingClientRect();
      const pb = panelEl.getBoundingClientRect();
      const ticketSize = ticket ? Number.parseFloat(getComputedStyle(ticket).fontSize) : null;
      return {
        headerBottom: hb.bottom,
        panelTop: pb.top,
        headerZ: Number.parseInt(getComputedStyle(header).zIndex, 10),
        panelZ: Number.parseInt(getComputedStyle(panelEl).zIndex, 10),
        leftGap: pb.left,
        rightGap: window.innerWidth - pb.right,
        expandDisplay: expand ? getComputedStyle(expand).display : 'none',
        closeVisible: close ? getComputedStyle(close).display !== 'none' : false,
        ticketSize,
      };
    });

    expect(chatLayout).not.toBeNull();
    expect(chatLayout!.panelTop, 'chat slides under the header').toBeGreaterThanOrEqual(
      chatLayout!.headerBottom - 1,
    );
    expect(chatLayout!.panelZ).toBeLessThan(chatLayout!.headerZ);
    expect(Math.abs(chatLayout!.leftGap - chatLayout!.rightGap)).toBeLessThanOrEqual(2);
    expect(chatLayout!.expandDisplay).toBe('none');
    expect(chatLayout!.closeVisible).toBe(true);
    if (chatLayout!.ticketSize !== null) {
      expect(chatLayout!.ticketSize).toBeLessThan(12);
    }
  });

  test('chat ticket alpha stays inside the open panel', async ({ page }) => {
    await page.goto('/');
    const consent = page.getByRole('dialog', { name: 'Cookie consent' });
    if (await consent.isVisible()) {
      await page.getByRole('button', { name: 'Decline' }).click();
    }

    const fab = page.locator('app-chat-widget').getByRole('button', { name: /Open chat/i });
    await expect(fab).toBeVisible({ timeout: 15_000 });
    await fab.click();
    await expect(page.locator('#interchouette-chat-panel')).toHaveClass(/chat-panel--open/);

    const ticket = page.locator('.chat-panel__ticket-code');
    await expect(ticket).toBeVisible({ timeout: 15_000 });
    await expect(ticket).toHaveText(/^[A-Z0-9]{6,}$/);

    const box = await page.evaluate(() => {
      const panelEl = document.querySelector('#interchouette-chat-panel');
      const code = document.querySelector('.chat-panel__ticket-code');
      const row = document.querySelector('.chat-panel__ticket');
      const titleEl = document.querySelector('.chat-panel__title');
      const close = document.querySelector('.chat-panel__close');
      if (!panelEl || !code || !row || !titleEl) {
        return null;
      }
      const p = panelEl.getBoundingClientRect();
      const c = code.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      const title = titleEl.getBoundingClientRect();
      const closeBox = close?.getBoundingClientRect();
      const overlap = (x: DOMRect, y: DOMRect) =>
        x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top;
      return {
        panelRight: p.right,
        codeRight: c.right,
        rowRight: r.right,
        codeOverflow: code.scrollWidth - code.clientWidth,
        text: (code.textContent ?? '').trim(),
        titleMid: title.top + title.height / 2,
        ticketMid: r.top + r.height / 2,
        overClose: closeBox ? overlap(r, closeBox) : false,
      };
    });

    expect(box).not.toBeNull();
    expect(box!.text.length, 'ticket alpha missing').toBeGreaterThanOrEqual(6);
    expect(box!.codeOverflow, 'ticket alpha text is clipped').toBeLessThanOrEqual(1);
    expect(box!.codeRight, 'ticket alpha hangs past the panel').toBeLessThanOrEqual(
      box!.panelRight - 1,
    );
    expect(box!.rowRight, 'ticket row hangs past the panel').toBeLessThanOrEqual(
      box!.panelRight - 1,
    );
    expect(
      Math.abs(box!.titleMid - box!.ticketMid),
      'ticket should sit on the title row, not an extra hero line',
    ).toBeLessThanOrEqual(8);
    expect(box!.overClose, 'ticket overlaps the close button').toBe(false);
    await expect(page.locator('.chat-panel__ticket-copy')).toBeHidden();
  });

  test('compose grows into the footer while the message field is focused', async ({ page }) => {
    await page.goto('/');
    const consent = page.getByRole('dialog', { name: 'Cookie consent' });
    if (await consent.isVisible()) {
      await page.getByRole('button', { name: 'Decline' }).click();
    }

    const fab = page.locator('app-chat-widget').getByRole('button', { name: /Open chat/i });
    await expect(fab).toBeVisible({ timeout: 15_000 });
    await fab.click();
    await expect(page.locator('#interchouette-chat-panel')).toHaveClass(/chat-panel--open/);

    const input = page.locator('.chat-panel__compose input[name="message"]');
    const fineprint = page.locator('.chat-panel__fineprint');
    await expect(input).toBeEnabled({ timeout: 15_000 });
    await expect(fineprint).toBeVisible();

    const idleHeight = await input.evaluate((el) => el.getBoundingClientRect().height);
    await input.click();
    await expect(fineprint).toBeHidden();
    const focusedHeight = await input.evaluate((el) => el.getBoundingClientRect().height);
    expect(focusedHeight, 'message field should grow into footer space').toBeGreaterThan(
      idleHeight + 8,
    );

    await page.locator('.chat-panel__title').click();
    await expect(fineprint).toBeVisible();
    const blurredHeight = await input.evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.abs(blurredHeight - idleHeight)).toBeLessThanOrEqual(2);
  });

  test('hamburger and locale popovers close each other', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('app-site-header');
    const menuBtn = header.locator('.site-header__menu-btn');
    const langBtn = header.locator('.site-header__lang-btn');
    const chip = header.locator('.site-header__lang-code');

    await menuBtn.click();
    await expect(header.getByRole('link', { name: 'News' })).toBeVisible();
    await expect(menuBtn).toHaveCSS('color', 'rgb(255, 210, 74)');
    await langBtn.click();
    await expect(header.getByRole('link', { name: 'Nederlands' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'News' })).toBeHidden();
    await expect(chip).toHaveCSS('color', 'rgb(255, 210, 74)');
    await expect(menuBtn).not.toHaveCSS('color', 'rgb(255, 210, 74)');

    await menuBtn.click();
    await expect(header.getByRole('link', { name: 'News' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Nederlands' })).toBeHidden();
    await expect(chip).not.toHaveCSS('color', 'rgb(255, 210, 74)');

    await langBtn.click();
    await langBtn.click();
    await expect(chip).not.toHaveCSS('color', 'rgb(255, 210, 74)');
  });
});

test.describe('home still ready after consent at 360x664', () => {
  test('card and footer remain on screen', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 664 });
    await gotoHomeReady(page);
    await expect(page.getByRole('heading', { name: 'Gregory Roussac' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Cookie consent' })).toHaveCount(0);
    const footer = page.locator('.site-footer');
    await expect(footer).toBeVisible();
  });
});

function isTransparentTap(value: string): boolean {
  return value === 'transparent' || value === 'rgba(0, 0, 0, 0)';
}
