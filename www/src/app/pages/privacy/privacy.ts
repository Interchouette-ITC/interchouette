import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ChatService } from '../../core/chat.service';
import { LocaleService } from '../../core/locale.service';
import { PageBrandMark } from '../../shared/page-brand-mark/page-brand-mark';
import { onPageTabKeydown } from '../../shared/page-tabs/page-tab-nav';
import { SiteFooter } from '../../shared/site-footer/site-footer';

export type PrivacyTabId = 'intro' | 'data' | 'features' | 'rights' | 'contact';

const TAB_ORDER: readonly PrivacyTabId[] = ['intro', 'data', 'features', 'rights', 'contact'];

@Component({
  selector: 'app-privacy-page',
  imports: [RouterLink, SiteFooter, PageBrandMark],
  templateUrl: './privacy.html',
  styleUrl: './privacy.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPage {
  protected readonly chat = inject(ChatService);
  protected readonly copy = inject(LocaleService).copy;
  protected readonly activeTab = signal<PrivacyTabId>('intro');
  protected readonly tabs = TAB_ORDER;

  protected tabLabel(id: PrivacyTabId): string {
    const privacy = this.copy.privacy;
    switch (id) {
      case 'intro':
        return privacy.tabIntro;
      case 'data':
        return privacy.tabData;
      case 'features':
        return privacy.tabFeatures;
      case 'rights':
        return privacy.tabRights;
      case 'contact':
        return privacy.tabContact;
    }
  }

  protected isActive(id: PrivacyTabId): boolean {
    return this.activeTab() === id;
  }

  protected selectTab(id: PrivacyTabId): void {
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
