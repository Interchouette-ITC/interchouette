import { Injectable, inject, signal } from '@angular/core';

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

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly feeds = signal<NewsFeeds | null>(null);
  readonly fetchedAt = signal<string | null>(null);
  readonly cacheTtlSecs = signal<number | null>(null);

  private loadedLocale: SiteLocale | null = null;

  /** Load news for the active site locale (once per locale per page lifetime). */
  load(): void {
    const locale = this.locale.locale;
    if (this.loading() || (this.loadedLocale === locale && this.feeds() !== null)) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    void this.fetch(locale);
  }

  updatedLabel(): string | null {
    const at = this.fetchedAt();
    if (!at) {
      return null;
    }
    const time = formatNewsTime(at, this.locale.locale);
    return fillCopy(this.locale.copy.news.updated, { time });
  }

  private async fetch(locale: SiteLocale): Promise<void> {
    try {
      const res = await fetch(`${chatApiBase()}/v1/news?locale=${locale}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = (await res.json()) as NewsResponse;
      this.feeds.set(body.feeds);
      this.fetchedAt.set(body.fetched_at);
      this.cacheTtlSecs.set(body.cache_ttl_secs);
      this.loadedLocale = locale;
    } catch {
      this.error.set(this.locale.copy.news.error);
      this.feeds.set(null);
    } finally {
      this.loading.set(false);
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
