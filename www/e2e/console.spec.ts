import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

import { mockNewsApi } from './news-mock';

const routes = [
  '/',
  '/CV',
  '/about',
  '/privacy',
  '/terms',
  '/news',
  '/archive',
  '/account',
  '/gis-signin',
  '/?lang=nl',
  '/?lang=fr',
] as const;

test.describe('browser console', () => {
  for (const path of routes) {
    test(`${path} has no console errors`, async ({ page }) => {
      const errors = await collectPageErrors(page, path);
      expect(errors, errors.join('\n')).toEqual([]);
    });
  }
});

async function collectPageErrors(page: Page, path: string): Promise<string[]> {
  if (path === '/news' || path === '/archive') {
    await mockNewsApi(page);
  }
  const errors: string[] = [];
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      errors.push(`console.error: ${msg.text()}`);
    }
  };
  const onPageError = (err: Error) => {
    errors.push(`pageerror: ${err.message}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  await page.goto(path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  return errors;
}
