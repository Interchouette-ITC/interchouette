import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, PLATFORM_ID, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AnalyticsService } from '../../core/analytics.service';
import { ConsentService } from '../../core/consent.service';
import { LocaleService } from '../../core/locale.service';

@Component({
  selector: 'app-consent-banner',
  imports: [RouterLink],
  templateUrl: './consent-banner.html',
  styleUrl: './consent-banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    ngSkipHydration: 'true',
  },
})
export class ConsentBanner {
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly consent = inject(ConsentService);
  private readonly analytics = inject(AnalyticsService);
  protected readonly copy = inject(LocaleService).copy;

  protected readonly joke = signal(this.pickJoke());

  protected readonly visible = signal(false);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.consent.hydrate();
    this.visible.set(this.consent.pending());
  }

  protected accept(): void {
    this.consent.accept();
    this.analytics.initAfterConsent();
    this.visible.set(false);
  }

  protected reject(): void {
    this.consent.reject();
    this.visible.set(false);
  }

  private pickJoke(): string {
    const jokes = this.copy.consent.jokes;
    return jokes[Math.floor(Math.random() * jokes.length)] ?? jokes[0] ?? '';
  }
}
