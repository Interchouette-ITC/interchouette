import { expect, test } from '@playwright/test';

test.describe('site header and locale', () => {
  test('header, News empty state, and login chrome', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('app-site-header');
    await expect(header.getByRole('link', { name: 'Interchouette', exact: true })).toBeVisible();
    await expect(header.getByRole('link', { name: 'News' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Customer login' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gregory Roussac' })).toBeVisible();
    await expect(
      page.getByText('Rust and Wasm freelance development for product teams.'),
    ).toBeVisible();

    await page.goto('/news');
    await expect(page.getByRole('heading', { name: 'News' })).toBeVisible();
    await expect(page.getByText('No posts yet.')).toBeVisible();

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Customer login' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeDisabled();
    await expect(page.getByText('Customer login is not configured yet.')).toBeVisible();
  });

  test('localhost lang query switches header and home copy', async ({ page }) => {
    await page.goto('/?lang=nl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    await expect(page).toHaveTitle(/freelance-ontwikkelaar/i);
    await expect(
      page.locator('app-site-header').getByRole('link', { name: 'Nieuws' }),
    ).toBeVisible();
    await expect(
      page.getByText('Freelance Rust- en Wasm-ontwikkeling voor productteams.'),
    ).toBeVisible();

    await page.goto('/?lang=fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page).toHaveTitle(/Développeur freelance/i);
    await expect(
      page.locator('app-site-header').getByRole('link', { name: 'Actualités' }),
    ).toBeVisible();
    await expect(
      page.getByText('Développement freelance Rust et Wasm pour les équipes produit.'),
    ).toBeVisible();
  });
});
