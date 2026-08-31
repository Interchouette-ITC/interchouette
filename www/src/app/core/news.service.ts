import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, PendingTasks, inject, signal } from '@angular/core';

import { apiBase } from './chat.constants';
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

export interface NewsArchiveWeek {
  week_id: string;
  fetched_at: string;
}

export interface NewsArchiveIndex {
  locale: string;
  weeks: NewsArchiveWeek[];
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

  readonly archiveLoading = signal(false);
  readonly archiveError = signal<string | null>(null);
  readonly archiveWeeks = signal<NewsArchiveWeek[]>([]);
  readonly archiveWeekId = signal<string | null>(null);
  readonly archiveWeekLoading = signal(false);
  readonly archiveFeeds = signal<NewsFeeds | null>(null);
  readonly archiveFetchedAt = signal<string | null>(null);

  private loadedLocale: SiteLocale | null = null;
  private inFlight = false;
  private liveLoaded = false;
  private archiveLoadedLocale: SiteLocale | null = null;
  private archiveInFlight = false;
  private archiveWeekInFlight: string | null = null;

  /**
   * Load news from API `GET /v1/news` (4h server cache).
   * No static snapshot: browser and future SSR both use the live API.
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
        await this.fetchLive(locale);
      } finally {
        this.loading.set(false);
        this.inFlight = false;
      }
    });
  }

  /** Load ISO-week archive index from `GET /v1/news/archive`. */
  loadArchive(preferredWeekId?: string): void {
    const locale = this.locale.locale;
    if (this.archiveInFlight) {
      return;
    }
    if (this.archiveLoadedLocale === locale && !preferredWeekId) {
      return;
    }
    this.archiveInFlight = true;
    this.archiveError.set(null);
    this.archiveLoading.set(true);
    this.pendingTasks.run(async () => {
      try {
        await this.fetchArchiveIndex(locale, preferredWeekId);
      } finally {
        this.archiveLoading.set(false);
        this.archiveInFlight = false;
      }
    });
  }

  /** Load one archived week into `archiveFeeds`. */
  selectArchiveWeek(weekId: string): void {
    const locale = this.locale.locale;
    if (this.archiveWeekInFlight === weekId) {
      return;
    }
    if (this.archiveWeekId() === weekId && this.archiveFeeds() !== null) {
      return;
    }
    this.archiveWeekInFlight = weekId;
    this.archiveWeekId.set(weekId);
    this.archiveWeekLoading.set(true);
    this.pendingTasks.run(async () => {
      try {
        await this.fetchArchiveWeek(locale, weekId);
      } finally {
        this.archiveWeekLoading.set(false);
        if (this.archiveWeekInFlight === weekId) {
          this.archiveWeekInFlight = null;
        }
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

  archiveUpdatedLabel(): string | null {
    const at = this.archiveFetchedAt();
    if (!at) {
      return null;
    }
    const time = formatNewsTime(at, this.locale.locale);
    return fillCopy(this.locale.copy.news.archiveSnapshot, { time });
  }

  private applyResponse(body: NewsResponse, locale: SiteLocale): void {
    this.feeds.set(body.feeds);
    this.fetchedAt.set(body.fetched_at);
    this.cacheTtlSecs.set(body.cache_ttl_secs);
    this.loadedLocale = locale;
  }

  private async fetchLive(locale: SiteLocale): Promise<void> {
    try {
      const res = await fetch(`${apiBase()}/v1/news?locale=${locale}`);
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

  private async fetchArchiveIndex(locale: SiteLocale, preferredWeekId?: string): Promise<void> {
    try {
      const res = await fetch(`${apiBase()}/v1/news/archive?locale=${locale}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = (await res.json()) as NewsArchiveIndex;
      this.archiveWeeks.set(body.weeks ?? []);
      this.archiveLoadedLocale = locale;
      this.archiveError.set(null);
      const weeks = body.weeks ?? [];
      const pick =
        (preferredWeekId && weeks.some((week) => week.week_id === preferredWeekId)
          ? preferredWeekId
          : null) ?? weeks[0]?.week_id;
      if (pick) {
        this.selectArchiveWeek(pick);
      } else {
        this.archiveWeekId.set(null);
        this.archiveFeeds.set(null);
        this.archiveFetchedAt.set(null);
      }
    } catch {
      this.archiveError.set(this.locale.copy.news.archiveError);
      this.archiveWeeks.set([]);
    }
  }

  private async fetchArchiveWeek(locale: SiteLocale, weekId: string): Promise<void> {
    try {
      const res = await fetch(
        `${apiBase()}/v1/news/archive/${encodeURIComponent(weekId)}?locale=${locale}`,
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = (await res.json()) as NewsResponse;
      if (this.archiveWeekId() !== weekId) {
        return;
      }
      this.archiveFeeds.set(body.feeds);
      this.archiveFetchedAt.set(body.fetched_at);
    } catch {
      if (this.archiveWeekId() === weekId) {
        this.archiveFeeds.set(null);
        this.archiveFetchedAt.set(null);
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
