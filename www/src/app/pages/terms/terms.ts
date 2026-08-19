import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ChatService } from '../../core/chat.service';
import { LocaleService } from '../../core/locale.service';
import { PageBrandMark } from '../../shared/page-brand-mark/page-brand-mark';
import { onPageTabKeydown } from '../../shared/page-tabs/page-tab-nav';
import { SiteFooter } from '../../shared/site-footer/site-footer';

export type TermsTabId = 'intro' | 'service' | 'rules' | 'legal' | 'contact';

const TAB_ORDER: readonly TermsTabId[] = ['intro', 'service', 'rules', 'legal', 'contact'];

@Component({
  selector: 'app-terms-page',
  imports: [RouterLink, SiteFooter, PageBrandMark],
  templateUrl: './terms.html',
  styleUrl: './terms.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsPage {
  protected readonly chat = inject(ChatService);
  protected readonly copy = inject(LocaleService).copy;
  protected readonly activeTab = signal<TermsTabId>('intro');
  protected readonly tabs = TAB_ORDER;

  protected tabLabel(id: TermsTabId): string {
    const terms = this.copy.terms;
    switch (id) {
      case 'intro':
        return terms.tabIntro;
      case 'service':
        return terms.tabService;
      case 'rules':
        return terms.tabRules;
      case 'legal':
        return terms.tabLegal;
      case 'contact':
        return terms.tabContact;
    }
  }

  protected isActive(id: TermsTabId): boolean {
    return this.activeTab() === id;
  }

  protected selectTab(id: TermsTabId): void {
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
