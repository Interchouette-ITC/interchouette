import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ChatService } from '../../core/chat.service';
import { SiteFooter } from '../../shared/site-footer/site-footer';

@Component({
  selector: 'app-privacy-page',
  imports: [RouterLink, SiteFooter],
  templateUrl: './privacy.html',
  styleUrl: './privacy.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPage {
  protected readonly chat = inject(ChatService);

  /** Open the chat panel when the widget is ready. */
  protected openChat(event: Event): void {
    event.preventDefault();
    if (!this.chat.ready()) {
      return;
    }
    void this.chat.openPanel();
  }
}
