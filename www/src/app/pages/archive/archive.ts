import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ChatLinkPart, isHttpHref as hrefIsHttp, splitHttpLinks } from '../../core/chat.links';
import { LocaleService } from '../../core/locale.service';
import {
  formatPostDate,
  NewsService,
  type NewsArchiveWeek,
  type NewsFeed,
  type NewsItem,
} from '../../core/news.service';
import { PageBrandMark } from '../../shared/page-brand-mark/page-brand-mark';
import { onPageTabKeydown } from '../../shared/page-tabs/page-tab-nav';
import { SiteFooter } from '../../shared/site-footer/site-footer';

export type ArchiveTabId = 'itcLinkedIn' | 'itcX';

const TAB_ORDER: readonly ArchiveTabId[] = ['itcX', 'itcLinkedIn'];

@Component({
  selector: 'app-archive-page',
  imports: [RouterLink, SiteFooter, PageBrandMark],
  templateUrl: './archive.html',
  styleUrl: './archive.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchivePage {
  protected readonly copy = inject(LocaleService).copy;
  protected readonly locale = inject(LocaleService).locale;
  protected readonly news = inject(NewsService);
  protected readonly activeTab = signal<ArchiveTabId>('itcX');
  protected readonly tabs = TAB_ORDER;

  constructor() {
    this.news.loadArchive();
  }

  protected tabLabel(id: ArchiveTabId): string {
    const n = this.copy.news;
    switch (id) {
      case 'itcLinkedIn':
        return n.tabItcLinkedIn;
      case 'itcX':
        return n.tabItcX;
    }
  }

  protected tabIconClass(id: ArchiveTabId): string {
    return id === 'itcX' ? 'fa fa-twitter' : 'fa fa-linkedin';
  }

  protected isActive(id: ArchiveTabId): boolean {
    return this.activeTab() === id;
  }

  protected selectTab(id: ArchiveTabId): void {
    this.activeTab.set(id);
  }

  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    onPageTabKeydown(event, index, TAB_ORDER, (id) => this.activeTab.set(id));
  }

  protected selectWeek(week: NewsArchiveWeek): void {
    this.news.selectArchiveWeek(week.week_id);
  }

  protected isSelectedWeek(weekId: string): boolean {
    return this.news.archiveWeekId() === weekId;
  }

  protected feedFor(id: ArchiveTabId): NewsFeed | null {
    const feeds = this.news.archiveFeeds();
    if (!feeds) {
      return null;
    }
    switch (id) {
      case 'itcLinkedIn':
        return feeds.itc_linkedin;
      case 'itcX':
        return feeds.itc_x;
    }
  }

  protected profileLabel(id: ArchiveTabId): string {
    switch (id) {
      case 'itcLinkedIn':
        return this.copy.news.profileItcLinkedIn;
      case 'itcX':
        return this.copy.news.profileItcX;
    }
  }

  protected viewOnLabel(id: ArchiveTabId): string {
    return id === 'itcX' ? this.copy.news.viewOnX : this.copy.news.viewOnLinkedIn;
  }

  protected postDate(item: NewsItem): string {
    return formatPostDate(item.published_at, this.locale);
  }

  protected weekLabel(week: NewsArchiveWeek): string {
    return week.week_id;
  }

  protected weekFetchedLabel(week: NewsArchiveWeek): string {
    return formatPostDate(week.fetched_at, this.locale);
  }

  protected linkParts(text: string): ChatLinkPart[] {
    return splitHttpLinks(text);
  }

  protected isHttpHref(href: string | null): boolean {
    return hrefIsHttp(href);
  }

  protected showListError(): boolean {
    return !this.news.archiveLoading() && this.news.archiveError() !== null;
  }

  protected showEmptyWeeks(): boolean {
    return (
      !this.news.archiveLoading() &&
      this.news.archiveError() === null &&
      this.news.archiveWeeks().length === 0
    );
  }

  protected feedNotice(id: ArchiveTabId): string | null {
    const feed = this.feedFor(id);
    if (feed === null || feed.items.length > 0) {
      return null;
    }
    if (feed.error != null && feed.error.length > 0) {
      return feed.error;
    }
    return this.copy.news.empty;
  }

  protected showFeedNotice(id: ArchiveTabId): boolean {
    return (
      this.news.archiveWeekId() !== null &&
      !this.news.archiveWeekLoading() &&
      this.feedNotice(id) !== null
    );
  }
}
