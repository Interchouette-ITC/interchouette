import type { Page } from '@playwright/test';

const EMPTY_NEWS = {
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
};

/** Stub API `/v1/news` (and archive) so e2e does not need a live API process. */
export async function mockNewsApi(page: Page): Promise<void> {
  await page.route('**/v1/news**', async (route) => {
    const url = route.request().url();
    if (url.includes('/v1/news/archive/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_NEWS),
      });
      return;
    }
    if (url.includes('/v1/news/archive')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          locale: 'en',
          weeks: [{ week_id: '2026-W35', fetched_at: '2026-08-28T12:00:00.000Z' }],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(EMPTY_NEWS),
    });
  });
}
