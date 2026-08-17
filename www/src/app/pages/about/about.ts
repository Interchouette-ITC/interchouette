import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ChatService } from '../../core/chat.service';
import { SiteFooter } from '../../shared/site-footer/site-footer';

@Component({
  selector: 'app-about-page',
  imports: [RouterLink, SiteFooter],
  templateUrl: './about.html',
  styleUrl: './about.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutPage {
  protected readonly chat = inject(ChatService);
  /** Calendar year for the discreet copyright line. */
  protected readonly currentYear = new Date().getFullYear();

  /** Open the chat panel when the widget is ready. */
  protected openChat(event: Event): void {
    event.preventDefault();
    if (!this.chat.ready()) {
      return;
    }
    void this.chat.openPanel();
  }
}
