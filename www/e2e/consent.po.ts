import type { Page } from '@playwright/test';

const CONSENT_KEY = 'ic.consent.v1';

/** Dismiss cookie banner before layout / chat checks (localStorage + click fallback). */
export async function acceptConsent(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    localStorage.setItem(key, 'accepted');
  }, CONSENT_KEY);
}

export async function gotoHomeReady(page: Page, path = '/'): Promise<void> {
  await acceptConsent(page);
  await page.goto(path);
}
