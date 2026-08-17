import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ChatService } from '../../core/chat.service';
import { LocaleService } from '../../core/locale.service';
import { SiteFooter } from '../../shared/site-footer/site-footer';

@Component({
  selector: 'app-terms-page',
  imports: [RouterLink, SiteFooter],
  templateUrl: './terms.html',
  styleUrl: './terms.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsPage {
  protected readonly chat = inject(ChatService);
  protected readonly copy = inject(LocaleService).copy;

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
