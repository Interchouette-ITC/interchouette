import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LocaleService } from './locale.service';
import { NewsService } from './news.service';

describe('NewsService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('seeds feeds from news-snapshot.json on the server', async () => {
    const snapshot = {
      fetched_at: '2026-08-20T12:00:00.000Z',
      cache_ttl_secs: 14400,
      feeds: {
        itc_linkedin: {
          items: [{ id: 'li1', text: 'LinkedIn snapshot post', url: 'https://example.com/li' }],
          profile_url: 'https://www.linkedin.com/company/interchouette-itc/',
        },
        itc_x: {
          items: [{ id: 'x1', text: 'X snapshot post', url: 'https://example.com/x' }],
          profile_url: 'https://x.com/interchouette',
        },
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('news-snapshot.json')) {
          return new Response(JSON.stringify(snapshot), { status: 200 });
        }
        return new Response('not found', { status: 404 });
      }),
    );

    TestBed.configureTestingModule({
      providers: [
        NewsService,
        { provide: PLATFORM_ID, useValue: 'server' },
        {
          provide: LocaleService,
          useValue: {
            locale: 'en',
            copy: {
              news: {
                updated: 'Updated {time}',
                error: 'Failed',
              },
            },
          },
        },
      ],
    });

    const news = TestBed.inject(NewsService);
    news.load();
    await vi.waitFor(() => {
      expect(news.feeds()?.itc_x.items[0]?.text).toBe('X snapshot post');
    });

    expect(news.feeds()?.itc_linkedin.items[0]?.text).toBe('LinkedIn snapshot post');
    expect(news.loading()).toBe(false);
  });
});
