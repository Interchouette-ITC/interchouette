import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, PLATFORM_ID, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AnalyticsService } from '../../core/analytics.service';
import { ConsentService } from '../../core/consent.service';

const COOKIE_BANNER_JOKES = [
  'We baked non-essential cookies. Want a bite for analytics?',
  'Cookie jar open: optional crumbs only (no judgment if you pass).',
  'These cookies are digital. Zero calories. Still need a yes.',
  'Accept for analytics cookies, or decline and keep the diet.',
  'Milk and cookies at night? Same energy: optional, comforting, and your call.',
] as const;

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

  protected readonly joke = signal(
    COOKIE_BANNER_JOKES[Math.floor(Math.random() * COOKIE_BANNER_JOKES.length)] ??
      COOKIE_BANNER_JOKES[0],
  );

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
}
