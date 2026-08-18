import { expect, test, type Locator } from '@playwright/test';

test.describe('site header and locale', () => {
  test('header, News empty state, and login chrome', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('app-site-header');
    await expect(header.getByRole('link', { name: 'interchouette.net' })).toBeVisible();
    await revealHeaderLinks(header);
    await expect(header.getByRole('link', { name: 'News' })).toBeVisible();
    const slack = header.locator('a.site-header__slack');
    await expect(slack).toBeVisible();
    await expect(slack).toHaveCSS('color', 'rgb(255, 210, 74)');
    await expect(header.getByRole('button', { name: 'Client login' })).toBeVisible();
    await expect(header.locator('.site-header__lang-btn')).toBeVisible();
    await expect(header.locator('.site-header__lang-btn')).toHaveText('EN');
    await expect(page.getByRole('heading', { name: 'Gregory Roussac' })).toBeVisible();
    await expect(page.getByText('Development for product teams.')).toBeVisible();
    await header.locator('.site-header__lang-btn').click();
    await expect(header.getByRole('link', { name: 'Nederlands' })).toBeVisible();
    if (await header.locator('.site-header__menu-btn').isVisible()) {
      await expect(header.getByRole('link', { name: 'News' })).toBeHidden();
    } else {
      await expect(header.getByRole('link', { name: 'News' })).toBeVisible();
    }

    await page.goto('/news');
    await expect(page.getByRole('heading', { name: 'News' })).toBeVisible();
    await expect(page.getByText('No posts yet.')).toBeVisible();
  });

  test('header language dropdown switches locale on localhost', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('app-site-header');
    await header.locator('.site-header__lang-btn').click();
    await header.getByRole('link', { name: 'Nederlands' }).click();
    await expect(page).toHaveURL(/\?lang=nl/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    const headerNl = page.locator('app-site-header');
    await revealHeaderLinks(headerNl);
    await expect(headerNl.getByRole('link', { name: 'Nieuws' })).toBeVisible();
    await expect(page.getByText('Ontwikkeling voor productteams.')).toBeVisible();
  });

  test('localhost lang query switches header and home copy', async ({ page }) => {
    await page.goto('/?lang=nl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    await expect(page).toHaveTitle(/freelance-ontwikkelaar/i);
    const header = page.locator('app-site-header');
    await revealHeaderLinks(header);
    await expect(header.getByRole('link', { name: 'Nieuws' })).toBeVisible();
    await expect(page.getByText('Ontwikkeling voor productteams.')).toBeVisible();
    await expect(header.getByRole('link', { name: 'interchouette.nl' })).toBeVisible();
    await expect(page.locator('app-site-footer')).not.toContainText('interchouette.nl');
    await expect(page.locator('app-site-footer')).not.toContainText('interchouette.fr');
    await expect(page.locator('app-site-footer').getByRole('link', { name: 'Over' })).toBeVisible();
    await expect(page.locator('app-site-footer').getByRole('link', { name: 'AV' })).toBeVisible();

    await page.goto('/?lang=fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page).toHaveTitle(/Développeur freelance/i);
    await revealHeaderLinks(page.locator('app-site-header'));
    await expect(
      page.locator('app-site-header').getByRole('link', { name: 'Actualités' }),
    ).toBeVisible();
    await expect(page.getByText('Développement pour les équipes produit.')).toBeVisible();
    await expect(
      page.locator('app-site-footer').getByRole('link', { name: 'Vie privée' }),
    ).toBeVisible();
    await expect(page.locator('app-site-footer').getByRole('link', { name: 'CGU' })).toBeVisible();

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

async function revealHeaderLinks(header: Locator): Promise<void> {
  const firstLink = header.locator('.site-header__menu-panel a').first();
  const menuBtn = header.locator('.site-header__menu-btn');
  if (await firstLink.isVisible()) {
    return;
  }
  if (await menuBtn.isVisible()) {
    await menuBtn.click();
  }
  await expect(firstLink).toBeVisible();
}
