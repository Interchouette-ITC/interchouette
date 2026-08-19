import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CHAT_WIDGET_ENABLED, CONTACT_EMAIL } from '../../core/chat.constants';
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
  private readonly router = inject(Router);
  private readonly logoDock = viewChild<ElementRef<HTMLElement>>('logoDock');

  /** Feature gate only (may still be warming). */
  protected readonly chatEnabled = CHAT_WIDGET_ENABLED;
  protected readonly email = CONTACT_EMAIL;
  protected readonly mailHref = `mailto:${CONTACT_EMAIL}`;
  protected readonly whatsappHref = 'https://wa.me/31620808454';
  protected readonly copied = signal(false);
  protected readonly logoHintVisible = signal(false);
  protected readonly logoHintCopy = signal('');

  private copyClearTimer: ReturnType<typeof setTimeout> | null = null;

  /** Card logo: first tap shows a hint bubble; second tap opens About. */
  protected onCardLogoClick(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.logoHintVisible()) {
      this.logoHintCopy.set(this.pickLogoHint());
      this.logoHintVisible.set(true);
      return;
    }
    this.logoHintVisible.set(false);
    void this.router.navigate(['/about']);
  }

  protected dismissLogoHint(event: MouseEvent): void {
    event.stopPropagation();
    this.logoHintVisible.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.logoHintVisible()) {
      return;
    }
    const dock = this.logoDock()?.nativeElement;
    if (dock?.contains(event.target as Node)) {
      return;
    }
    this.logoHintVisible.set(false);
  }

  private pickLogoHint(): string {
    const hooks = this.copy.home.cardLogoHints;
    return hooks[Math.floor(Math.random() * hooks.length)] ?? hooks[0];
  }

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
