import { expect, test } from '@playwright/test';

test.describe('URL parity', () => {
  test('home shows Gregory card', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Gregory Roussac' })).toBeVisible();
    await expect(page.getByText('Rust - Wasm Freelance Developer')).toBeVisible();
  });

  test('CV page renders', async ({ page }) => {
    await page.goto('/CV');
    await expect(page.getByRole('heading', { name: 'Gregory Roussac' })).toBeVisible();
    await expect(page.getByText('Professional Summary')).toBeVisible();
  });

  test('privacy and terms render', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
  });
});
