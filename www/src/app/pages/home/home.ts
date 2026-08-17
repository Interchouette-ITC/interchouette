import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CONTACT_EMAIL, CHAT_WIDGET_ENABLED } from '../../core/chat.constants';
import { ChatService } from '../../core/chat.service';
import { fillCopy } from '../../core/i18n/catalog';
import { LocaleService } from '../../core/locale.service';
import { SiteFooter } from '../../shared/site-footer/site-footer';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, SiteFooter],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  protected readonly chat = inject(ChatService);
  protected readonly copy = inject(LocaleService).copy;

  /** Feature gate only (may still be warming). */
  protected readonly chatEnabled = CHAT_WIDGET_ENABLED;
  protected readonly email = CONTACT_EMAIL;
  protected readonly mailHref = `mailto:${CONTACT_EMAIL}`;
  protected readonly whatsappHref = 'https://wa.me/31620808454';
  protected readonly copied = signal(false);

  private copyClearTimer: ReturnType<typeof setTimeout> | null = null;

  /** Avatar: open chat only when the socket is ready. */
  protected openChat(): void {
    if (!this.chat.ready()) {
      return;
    }
    void this.chat.openPanel();
  }

  protected avatarAriaLabel(): string | null {
    if (!this.chat.ready()) {
      return null;
    }
    return this.chat.hero() === 'greg' ? this.copy.home.avatarGreg : this.copy.home.avatarItcy;
  }

  protected contactAriaLabel(): string {
    if (this.chat.ready()) {
      const who = this.chat.hero() === 'greg' ? 'Greg' : 'ITCy';
      return fillCopy(this.copy.home.contactChat, { who, email: this.email });
    }
    if (this.chatEnabled) {
      return fillCopy(this.copy.home.contactWarming, { email: this.email });
    }
    return fillCopy(this.copy.home.contactMail, { email: this.email });
  }

  protected contactTitle(): string {
    if (this.copied()) {
      return this.copy.home.emailCopied;
    }
    return this.contactAriaLabel();
  }

  /**
   * Whole purple bar: always copy email.
   * Chat ready → no mailto; open chat instead.
   * Chat off / warming → classic mailto.
   */
  protected onContactClick(event: Event): void {
    void this.copyEmail();

    if (!this.chat.ready()) {
      return;
    }

    event.preventDefault();
    void this.chat.openPanel();
  }

  private async copyEmail(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.email);
      this.copied.set(true);
      if (this.copyClearTimer) {
        clearTimeout(this.copyClearTimer);
      }
      this.copyClearTimer = setTimeout(() => this.copied.set(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  }
}
