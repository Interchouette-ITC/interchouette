import type { Page } from '@playwright/test';

/** Stub chat backend news feed so e2e does not require a live `/v1/news` process. */
export async function mockNewsApi(page: Page): Promise<void> {
  await page.route('**/v1/news**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        fetched_at: '2026-08-20T12:00:00.000Z',
        cache_ttl_secs: 14400,
        feeds: {
          itc_linkedin: {
            items: [],
            profile_url: 'https://www.linkedin.com/company/interchouette-itc/posts/?feedView=all',
            error: null,
          },
          itc_x: {
            items: [],
            profile_url: 'https://x.com/interchouette',
            error: null,
          },
        },
      }),
    });
  });
}
