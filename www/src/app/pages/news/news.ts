import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { LocaleService } from '../../core/locale.service';
import { ChatLinkPart, isHttpHref as hrefIsHttp, splitHttpLinks } from '../../core/chat.links';
import { newsListingDescription, newsListingJsonLd } from '../../core/news-seo';
import { formatPostDate, NewsService, type NewsFeed, type NewsItem } from '../../core/news.service';
import { LOCALE_ORIGINS } from '../../core/seo.constants';
import { SeoService } from '../../core/seo.service';
import { PageBrandMark } from '../../shared/page-brand-mark/page-brand-mark';
import { onPageTabKeydown } from '../../shared/page-tabs/page-tab-nav';
import { SiteFooter } from '../../shared/site-footer/site-footer';

export type NewsTabId = 'itcLinkedIn' | 'itcX';

const TAB_ORDER: readonly NewsTabId[] = ['itcX', 'itcLinkedIn'];

@Component({
  selector: 'app-news-page',
  imports: [RouterLink, SiteFooter, PageBrandMark],
  templateUrl: './news.html',
  styleUrl: './news.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsPage {
  protected readonly copy = inject(LocaleService).copy;
  protected readonly locale = inject(LocaleService).locale;
  protected readonly news = inject(NewsService);
  private readonly seo = inject(SeoService);
  protected readonly activeTab = signal<NewsTabId>('itcX');
  protected readonly tabs = TAB_ORDER;

  protected readonly linkedinProfileUrl =
    'https://www.linkedin.com/company/interchouette-itc/posts/?feedView=all';
  protected readonly xProfileUrl = 'https://x.com/interchouette';

  constructor() {
    this.news.load();
    effect(() => {
      const feeds = this.news.feeds();
      if (!feeds) {
        return;
      }
      const origin = LOCALE_ORIGINS[this.locale];
      const pageUrl = `${origin}/news`;
      this.seo.applyPageExtras({
        title: this.copy.titleNews,
        description: newsListingDescription(feeds, this.copy.descNews),
        jsonLd: newsListingJsonLd(feeds, pageUrl, this.copy.titleNews),
      });
    });
  }

  protected tabLabel(id: NewsTabId): string {
    const n = this.copy.news;
    switch (id) {
      case 'itcLinkedIn':
        return n.tabItcLinkedIn;
      case 'itcX':
        return n.tabItcX;
    }
  }

  protected tabIconClass(id: NewsTabId): string {
    return id === 'itcX' ? 'fa fa-twitter' : 'fa fa-linkedin';
  }

  protected isActive(id: NewsTabId): boolean {
    return this.activeTab() === id;
  }

  protected selectTab(id: NewsTabId): void {
    this.activeTab.set(id);
  }

  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    onPageTabKeydown(event, index, TAB_ORDER, (id) => this.activeTab.set(id));
  }

  protected feedFor(id: NewsTabId): NewsFeed | null {
    const feeds = this.news.feeds();
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

  protected profileLabel(id: NewsTabId): string {
    switch (id) {
      case 'itcLinkedIn':
        return this.copy.news.profileItcLinkedIn;
      case 'itcX':
        return this.copy.news.profileItcX;
    }
  }

  protected viewOnLabel(id: NewsTabId): string {
    return id === 'itcX' ? this.copy.news.viewOnX : this.copy.news.viewOnLinkedIn;
  }

  protected postDate(item: NewsItem): string {
    return formatPostDate(item.published_at, this.locale);
  }

  protected linkParts(text: string): ChatLinkPart[] {
    return splitHttpLinks(text);
  }

  protected isHttpHref(href: string | null): boolean {
    return hrefIsHttp(href);
  }

  protected showGlobalError(): boolean {
    return !this.news.loading() && this.news.error() !== null && this.news.feeds() === null;
  }

  protected feedNotice(id: NewsTabId): string | null {
    const feed = this.feedFor(id);
    if (feed === null || feed.items.length > 0) {
      return null;
    }
    if (feed.error != null && feed.error.length > 0) {
      return feed.error;
    }
    return this.copy.news.empty;
  }

  protected showFeedNotice(id: NewsTabId): boolean {
    return !this.news.loading() && !this.showGlobalError() && this.feedNotice(id) !== null;
  }
}
