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
    const fab = page.getByRole('button', { name: /Open chat/i });
    await expect(fab).toBeVisible({ timeout: 15_000 });
    await fab.click();
    const panel = page.locator('#interchouette-chat-panel');
    await expect(panel).toHaveClass(/chat-panel--open/);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Chat with (Greg|ITCy)|Connecting/)).toBeVisible();

    const input = page.getByRole('textbox', { name: 'Message' });
    await expect(input).toBeEnabled({ timeout: 15_000 });
    await input.fill('What is Interchouette?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('What is Interchouette?')).toBeVisible();

    if (away) {
      await expect(page.locator('.chat-bubble[data-role="itcy"]').first()).toBeVisible({
        timeout: 25_000,
      });
    }
  });
});
