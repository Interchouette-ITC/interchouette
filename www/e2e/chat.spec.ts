import { expect, test } from '@playwright/test';

test.describe('chat widget', () => {
  test('FAB opens panel and can send with mocked chat transport', async ({ page }) => {
    await page.addInitScript(() => {
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const href =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (method === 'POST' && /\/v1\/sessions$/.test(href)) {
          return new Response(
            JSON.stringify({
              session_id: 'sess-mock',
              short_code: 'MOCK1234',
              mode: 'away',
              label: 'Away',
              hero: 'itcy',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return realFetch(input, init);
      };

      class MockChatSocket {
        static OPEN = 1;
        static CLOSED = 3;
        readyState = MockChatSocket.OPEN;
        onopen: ((ev: Event) => void) | null = null;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        onclose: ((ev: Event) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;

        constructor(_url: string) {
          queueMicrotask(() => {
            this.onopen?.(new Event('open'));
            this.emit({
              type: 'ready',
              session_id: 'sess-mock',
              short_code: 'MOCK1234',
              mode: 'away',
              label: 'Away',
              hero: 'itcy',
            });
          });
        }

        send(payload: string): void {
          let parsed: { type?: string; text?: string } | null = null;
          try {
            parsed = JSON.parse(payload) as { type?: string; text?: string };
          } catch {
            return;
          }
          if (parsed.type !== 'message') {
            return;
          }
          const text = String(parsed.text ?? '').trim();
          this.emit({ type: 'message', id: `v-${Date.now()}`, role: 'visitor', text });
          this.emit({ type: 'typing', active: true });
          setTimeout(() => {
            this.emit({ type: 'typing', active: false });
            this.emit({
              type: 'message',
              id: `i-${Date.now()}`,
              role: 'itcy',
              text: 'Interchouette builds Rust, Wasm, and web product work.',
            });
          }, 30);
        }

        close(): void {
          this.readyState = MockChatSocket.CLOSED;
          this.onclose?.(new Event('close'));
        }

        private emit(data: object): void {
          this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
        }
      }

      Object.defineProperty(window, 'WebSocket', {
        configurable: true,
        writable: true,
        value: MockChatSocket,
      });
    });

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
    const message = page.locator('#interchouette-chat-panel textarea[name="message"]');
    await expect(message, 'message field focused after open animation').toBeFocused({
      timeout: 2000,
    });
    await page.locator('.chat-panel__title').click();
    await expect(page.getByRole('dialog', { name: /Chat with|Connecting/i })).toBeVisible();
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
    const input = page.locator('#interchouette-chat-panel textarea[name="message"]');
    await expect(input).toBeEnabled({ timeout: 15_000 });
    await input.click();
    await expect(page.locator('form.chat-panel__email')).toBeVisible();
    await expect
      .poll(async () => input.evaluate((el) => el.getBoundingClientRect().height))
      .toBeGreaterThan(60);

    await input.fill('What is Interchouette?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('What is Interchouette?')).toBeVisible();

    const itcy = page.locator('.chat-bubble[data-role="itcy"]').first();
    await expect(itcy).toBeVisible({ timeout: 25_000 });
    await expect(itcy).not.toContainText('](mailto:');
    const select = await itcy.evaluate((el) => getComputedStyle(el).userSelect);
    expect(select === 'text' || select === 'auto').toBeTruthy();
  });
});
