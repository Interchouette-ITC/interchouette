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

/** Stub API `/v1/news` so e2e does not need a live API process. */
export async function mockNewsApi(page: Page): Promise<void> {
  await page.route('**/v1/news**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(EMPTY_NEWS),
    });
  });
}
