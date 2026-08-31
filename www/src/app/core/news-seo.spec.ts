import { describe, expect, it } from 'vitest';

import { newsListingDescription, newsListingJsonLd } from './news-seo';
import type { NewsFeeds } from './news.service';

const feeds: NewsFeeds = {
  itc_x: {
    items: [
      {
        id: 'x-1',
        text: 'Rust MCP shipping on interchouette.net',
        url: 'https://x.com/interchouette/status/1',
        published_at: '2026-08-30T10:00:00.000Z',
      },
    ],
    profile_url: 'https://x.com/interchouette',
  },
  itc_linkedin: {
    items: [
      {
        id: 'li-1',
        text: 'Interchouette ITC weekly update',
        url: 'https://www.linkedin.com/feed/update/1',
        published_at: '2026-08-29T10:00:00.000Z',
      },
    ],
    profile_url: 'https://www.linkedin.com/company/interchouette-itc/posts/?feedView=all',
  },
};

describe('news-seo', () => {
  it('builds a description from latest posts', () => {
    const description = newsListingDescription(feeds, 'fallback');
    expect(description).toContain('Rust MCP');
    expect(description).toContain('Interchouette ITC weekly update');
    expect(description.length).toBeLessThanOrEqual(155);
  });

  it('emits ItemList JSON-LD', () => {
    const jsonLd = newsListingJsonLd(feeds, 'https://interchouette.net/news', 'News');
    expect(jsonLd['@type']).toBe('ItemList');
    const list = jsonLd['itemListElement'] as { item: { '@type': string } }[];
    expect(list).toHaveLength(2);
    expect(list[0]?.item['@type']).toBe('SocialMediaPosting');
  });
});
