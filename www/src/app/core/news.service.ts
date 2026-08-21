import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, PendingTasks, inject, signal } from '@angular/core';

import { chatApiBase } from './chat.constants';
import { fillCopy } from './i18n/catalog';
import { LocaleService } from './locale.service';
import type { SiteLocale } from './site-locale';

export interface NewsItem {
  id: string;
  text: string;
  url: string;
  published_at?: string | null;
}

export interface NewsFeed {
  items: NewsItem[];
  profile_url: string;
  error?: string | null;
}

export interface NewsFeeds {
  itc_linkedin: NewsFeed;
  itc_x: NewsFeed;
}

export interface NewsResponse {
  fetched_at: string;
  cache_ttl_secs: number;
  feeds: NewsFeeds;
}

@Injectable({ providedIn: 'root' })
export class NewsService {
  private readonly locale = inject(LocaleService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly pendingTasks = inject(PendingTasks);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly feeds = signal<NewsFeeds | null>(null);
  readonly fetchedAt = signal<string | null>(null);
  readonly cacheTtlSecs = signal<number | null>(null);

  private loadedLocale: SiteLocale | null = null;
  private inFlight = false;
  private liveLoaded = false;

  /**
   * Load news for the active site locale.
   * Prerender seeds from `/news-snapshot.json` (PendingTasks) so post text is in HTML.
   * Browser refreshes from live `GET /v1/news` after hydrate.
   */
  load(): void {
    const locale = this.locale.locale;
    if (this.inFlight) {
      return;
    }
    if (
      this.loadedLocale === locale &&
      this.feeds() !== null &&
      (!isPlatformBrowser(this.platformId) || this.liveLoaded)
    ) {
      return;
    }
    this.inFlight = true;
    this.error.set(null);
    if (this.feeds() === null) {
      this.loading.set(true);
    }
    this.pendingTasks.run(async () => {
      try {
        if (this.feeds() === null) {
          await this.seedFromSnapshot();
        }
        if (isPlatformBrowser(this.platformId)) {
          await this.fetchLive(locale);
        }
      } finally {
        this.loading.set(false);
        this.inFlight = false;
      }
    });
  }

  updatedLabel(): string | null {
    const at = this.fetchedAt();
    if (!at) {
      return null;
    }
    const time = formatNewsTime(at, this.locale.locale);
    return fillCopy(this.locale.copy.news.updated, { time });
  }

  private applyResponse(body: NewsResponse, locale: SiteLocale): void {
    this.feeds.set(body.feeds);
    this.fetchedAt.set(body.fetched_at);
    this.cacheTtlSecs.set(body.cache_ttl_secs);
    this.loadedLocale = locale;
  }

  private async seedFromSnapshot(): Promise<void> {
    try {
      const res = await fetch('/news-snapshot.json');
      if (!res.ok) {
        return;
      }
      const body = (await res.json()) as NewsResponse;
      if (body?.feeds) {
        this.applyResponse(body, this.locale.locale);
      }
    } catch {
      /* soft: prerender/build still succeeds with empty list */
    }
  }

  private async fetchLive(locale: SiteLocale): Promise<void> {
    try {
      const res = await fetch(`${chatApiBase()}/v1/news?locale=${locale}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = (await res.json()) as NewsResponse;
      this.applyResponse(body, locale);
      this.liveLoaded = true;
      this.error.set(null);
    } catch {
      if (this.feeds() === null) {
        this.error.set(this.locale.copy.news.error);
      }
    }
  }
}

function formatNewsTime(iso: string, locale: SiteLocale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const tag = locale === 'nl' ? 'nl-NL' : locale === 'fr' ? 'fr-FR' : 'en-GB';
  return new Intl.DateTimeFormat(tag, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatPostDate(iso: string | null | undefined, locale: SiteLocale): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const tag = locale === 'nl' ? 'nl-NL' : locale === 'fr' ? 'fr-FR' : 'en-GB';
  return new Intl.DateTimeFormat(tag, { dateStyle: 'medium' }).format(date);
}
