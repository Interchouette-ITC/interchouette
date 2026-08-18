import { expect, test } from '@playwright/test';

test.describe('site header and locale', () => {
  test('header, News empty state, and login chrome', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('app-site-header');
    await expect(header.getByRole('link', { name: 'interchouette.net' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'News' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Client login' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gregory Roussac' })).toBeVisible();
    await expect(page.getByText('Development for product teams.')).toBeVisible();

    await page.goto('/news');
    await expect(page.getByRole('heading', { name: 'News' })).toBeVisible();
    await expect(page.getByText('No posts yet.')).toBeVisible();
  });

  test('localhost lang query switches header and home copy', async ({ page }) => {
    await page.goto('/?lang=nl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    await expect(page).toHaveTitle(/freelance-ontwikkelaar/i);
    await expect(
      page.locator('app-site-header').getByRole('link', { name: 'Nieuws' }),
    ).toBeVisible();
    await expect(page.getByText('Ontwikkeling voor productteams.')).toBeVisible();

    await page.goto('/?lang=fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page).toHaveTitle(/Développeur freelance/i);
    await expect(
      page.locator('app-site-header').getByRole('link', { name: 'Actualités' }),
    ).toBeVisible();
    await expect(page.getByText('Développement pour les équipes produit.')).toBeVisible();

    await page.goto('/about?lang=nl');
    await expect(page.getByRole('heading', { name: /Over Interchouette/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toHaveCount(0);

    await page.goto('/privacy?lang=nl');
    await expect(page.getByRole('heading', { name: 'Privacybeleid' })).toBeVisible();
    await expect(page.getByText(/Google Identity Services/i)).toBeVisible();

    await page.goto('/CV?lang=nl');
    await expect(page).toHaveTitle('Gregory Roussac - CV');
    await expect(page.getByRole('heading', { name: 'Professional Summary' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Download PDF/i })).toBeVisible();
  });
});
