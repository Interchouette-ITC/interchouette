import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LocaleService } from './locale.service';
import { NewsService } from './news.service';

describe('NewsService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('loads feeds from API /v1/news', async () => {
    const live = {
      fetched_at: '2026-08-20T13:00:00.000Z',
      cache_ttl_secs: 14400,
      feeds: {
        itc_linkedin: {
          items: [{ id: 'li2', text: 'LinkedIn live post', url: 'https://example.com/li2' }],
          profile_url: 'https://www.linkedin.com/company/interchouette-itc/',
        },
        itc_x: {
          items: [{ id: 'x2', text: 'X live post', url: 'https://example.com/x2' }],
          profile_url: 'https://x.com/interchouette',
        },
      },
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/news') && !url.includes('/archive')) {
        return new Response(JSON.stringify(live), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    TestBed.configureTestingModule({
      providers: [
        NewsService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: LocaleService,
          useValue: {
            locale: 'en',
            copy: {
              news: {
                updated: 'Updated {time}',
                error: 'Failed',
                archiveError: 'Archive failed',
                archiveSnapshot: 'Snapshot {time}',
              },
            },
          },
        },
      ],
    });

    const news = TestBed.inject(NewsService);
    news.load();
    await vi.waitFor(() => {
      expect(news.feeds()?.itc_x.items[0]?.text).toBe('X live post');
    });
    expect(news.feeds()?.itc_linkedin.items[0]?.text).toBe('LinkedIn live post');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/news');
  });

  it('loads archive index from API /v1/news/archive', async () => {
    const index = {
      locale: 'en',
      weeks: [{ week_id: '2026-W34', fetched_at: '2026-08-21T12:00:00.000Z' }],
    };
    const week = {
      fetched_at: '2026-08-21T12:00:00.000Z',
      cache_ttl_secs: 14400,
      feeds: {
        itc_linkedin: {
          items: [],
          profile_url: 'https://www.linkedin.com/company/interchouette-itc/',
        },
        itc_x: {
          items: [{ id: 'x1', text: 'Archived X', url: 'https://example.com/x1' }],
          profile_url: 'https://x.com/interchouette',
        },
      },
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/news/archive/2026-W34')) {
        return new Response(JSON.stringify(week), { status: 200 });
      }
      if (url.includes('/v1/news/archive')) {
        return new Response(JSON.stringify(index), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    TestBed.configureTestingModule({
      providers: [
        NewsService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: LocaleService,
          useValue: {
            locale: 'en',
            copy: {
              news: {
                updated: 'Updated {time}',
                error: 'Failed',
                archiveError: 'Archive failed',
                archiveSnapshot: 'Snapshot {time}',
              },
            },
          },
        },
      ],
    });

    const news = TestBed.inject(NewsService);
    news.loadArchive();
    await vi.waitFor(() => {
      expect(news.archiveWeeks()[0]?.week_id).toBe('2026-W34');
    });
    await vi.waitFor(() => {
      expect(news.archiveFeeds()?.itc_x.items[0]?.text).toBe('Archived X');
    });
  });
});
