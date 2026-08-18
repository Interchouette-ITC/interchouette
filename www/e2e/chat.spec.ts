import { expect, test } from '@playwright/test';

test.describe('chat widget', () => {
  test('FAB opens panel and can send when API is up', async ({ page }) => {
    const api = process.env['CHAT_API_BASE'] ?? 'http://127.0.0.1:8080';
    const health = await page.request.get(`${api}/health`).catch(() => null);
    test.skip(!health || !health.ok(), 'chat API not running on :8080');

    const presence = await page.request.get(`${api}/v1/presence`);
    const presenceBody = presence.ok() ? ((await presence.json()) as { mode?: string }) : {};
    const away = presenceBody.mode === 'away';

    await page.goto('/');
    const consent = page.getByRole('dialog', { name: 'Cookie consent' });
    if (await consent.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Decline' }).click();
    }
    const fab = page.locator('app-chat-widget').getByRole('button', { name: /Open chat/i });
    await expect(fab).toBeVisible({ timeout: 15_000 });
    await fab.click();
    const panel = page.locator('#interchouette-chat-panel');
    await expect(panel).toHaveClass(/chat-panel--open/);
    await expect(page.getByRole('dialog', { name: /Chat with/i })).toBeVisible();
    const starterChips = page.locator('.chat-panel__chips .chat-chip');
    if (await starterChips.first().isVisible()) {
      const desktop = (page.viewportSize()?.width ?? 0) >= 1280;
      await expect(starterChips).toHaveCount(desktop ? 3 : 2);
    }
    await expect(
      page.getByRole('button', { name: 'Forget this chat and clear the local transcript' }),
    ).toBeVisible();
    await expect(page.locator('form.chat-panel__compose')).toHaveAttribute(
      'toolname',
      'send_site_chat_message',
    );

    const clearance = await page.evaluate(() => {
      const headerEl = document.querySelector('app-site-header');
      const panelEl = document.querySelector('#interchouette-chat-panel');
      if (!headerEl || !panelEl) {
        return null;
      }
      const h = headerEl.getBoundingClientRect();
      const p = panelEl.getBoundingClientRect();
      return {
        headerBottom: h.bottom,
        panelTop: p.top,
        panelBottom: p.bottom,
        vh: window.innerHeight,
      };
    });
    expect(clearance).not.toBeNull();
    expect(
      clearance!.panelTop,
      'desktop chat must sit below the site header',
    ).toBeGreaterThanOrEqual(clearance!.headerBottom - 1);

    const wide = (page.viewportSize()?.width ?? 0) >= 768;
    if (wide) {
      const ticket = page.locator('.chat-panel__ticket');
      if (await ticket.isVisible()) {
        const place = await page.evaluate(() => {
          const titleEl = document.querySelector('.chat-panel__title');
          const statusEl = document.querySelector('.chat-panel__status');
          const ticketEl = document.querySelector('.chat-panel__ticket');
          if (!titleEl || !statusEl || !ticketEl) {
            return null;
          }
          const title = titleEl.getBoundingClientRect();
          const status = statusEl.getBoundingClientRect();
          const code = ticketEl.getBoundingClientRect();
          return {
            titleBottom: title.bottom,
            statusTop: status.top,
            ticketTop: code.top,
            copyVisible:
              getComputedStyle(document.querySelector('.chat-panel__ticket-copy') as Element)
                .display !== 'none',
          };
        });
        expect(place).not.toBeNull();
        expect(place!.ticketTop, 'desktop ticket stays on the status row').toBeGreaterThan(
          place!.titleBottom - 2,
        );
        expect(
          Math.abs(place!.ticketTop - place!.statusTop),
          'desktop ticket aligns with status, not the title',
        ).toBeLessThanOrEqual(8);
        expect(place!.copyVisible, 'desktop ticket keeps the copy icon').toBe(true);
      }
    }
    const bandMid = (clearance!.headerBottom + clearance!.vh) / 2;
    const panelMid = (clearance!.panelTop + clearance!.panelBottom) / 2;
    if (clearance!.vh <= 860) {
      expect(
        Math.abs(panelMid - bandMid),
        'short desktop chat should sit in the band below the header',
      ).toBeLessThanOrEqual(48);
    }

    await page.locator('.chat-panel__email-toggle').click();
    await expect(page.locator('form.chat-panel__email')).toBeVisible();
    const input = page.getByRole('textbox', { name: 'Message' });
    await expect(input).toBeEnabled({ timeout: 15_000 });
    await input.click();
    await expect(page.locator('form.chat-panel__email')).toBeVisible();
    const composeH = await input.evaluate((el) => el.getBoundingClientRect().height);
    expect(composeH, 'message field is a multi-line textarea').toBeGreaterThan(60);

    await input.fill('What is Interchouette?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('What is Interchouette?')).toBeVisible();

    if (away) {
      const itcy = page.locator('.chat-bubble[data-role="itcy"]').first();
      await expect(itcy).toBeVisible({ timeout: 25_000 });
      await expect(itcy).not.toContainText('](mailto:');
      const select = await itcy.evaluate((el) => getComputedStyle(el).userSelect);
      expect(select === 'text' || select === 'auto').toBeTruthy();
    }
  });
});
