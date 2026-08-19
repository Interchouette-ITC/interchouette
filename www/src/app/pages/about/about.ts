import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ChatService } from '../../core/chat.service';
import { LocaleService } from '../../core/locale.service';
import { PageBrandMark } from '../../shared/page-brand-mark/page-brand-mark';
import { onPageTabKeydown } from '../../shared/page-tabs/page-tab-nav';
import { SiteFooter } from '../../shared/site-footer/site-footer';

export type AboutTabId = 'about' | 'work' | 'site' | 'itcy' | 'connect';

const TAB_ORDER: readonly AboutTabId[] = ['about', 'work', 'site', 'itcy', 'connect'];

@Component({
  selector: 'app-about-page',
  imports: [RouterLink, SiteFooter, PageBrandMark],
  templateUrl: './about.html',
  styleUrl: './about.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutPage {
  protected readonly chat = inject(ChatService);
  protected readonly copy = inject(LocaleService).copy;
  /** Calendar year for the discreet copyright line. */
  protected readonly currentYear = new Date().getFullYear();
  protected readonly activeTab = signal<AboutTabId>('about');
  protected readonly tabs = TAB_ORDER;

  protected tabLabel(id: AboutTabId): string {
    const about = this.copy.about;
    switch (id) {
      case 'about':
        return about.tabAbout;
      case 'work':
        return about.tabWork;
      case 'site':
        return about.tabSite;
      case 'itcy':
        return about.tabItcy;
      case 'connect':
        return about.tabConnect;
    }
  }

  protected isActive(id: AboutTabId): boolean {
    return this.activeTab() === id;
  }

  protected selectTab(id: AboutTabId): void {
    this.activeTab.set(id);
  }

  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    onPageTabKeydown(event, index, TAB_ORDER, (id) => this.activeTab.set(id));
  }

  protected chatAria(): string {
    return this.chat.hero() === 'greg' ? this.copy.chat.fabGreg : this.copy.chat.fabItcy;
  }

  /** Open the chat panel when the widget is ready. */
  protected openChat(event: Event): void {
    event.preventDefault();
    if (!this.chat.ready()) {
      return;
    }
    void this.chat.openPanel();
  }
}
