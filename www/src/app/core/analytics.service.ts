import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

import { GA_MEASUREMENT_ID } from './analytics.constants';
import { ConsentService } from './consent.service';

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** First user gesture — keep gtag off FCP/LCP. Late timer covers no-interaction sessions. */
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
const NO_INTERACTION_FALLBACK_MS = 12_000;

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly consent = inject(ConsentService);
  private booted = false;
  private arming = false;

  /**
   * Browser only. Boots GA after non-essential cookie consent (Accept).
   * If consent was already stored as accepted, arms the deferred loader.
   */
  init(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.consent.hydrate();
    if (this.consent.acceptsNonEssential()) {
      this.initAfterConsent();
    }
  }

  /** Call after the visitor accepts non-essential cookies. */
  initAfterConsent(): void {
    if (this.booted || this.arming || !isPlatformBrowser(this.platformId)) {
      return;
    }
    if (!this.consent.acceptsNonEssential()) {
      return;
    }
    this.arming = true;
    this.armDeferredBoot();
  }

  private armDeferredBoot(): void {
    let fallbackId = 0;

    const bootOnce = () => {
      if (this.booted) {
        return;
      }
      window.clearTimeout(fallbackId);
      for (const type of INTERACTION_EVENTS) {
        window.removeEventListener(type, bootOnce, { capture: true });
      }
      this.bootGtag();
    };

    for (const type of INTERACTION_EVENTS) {
      window.addEventListener(type, bootOnce, { capture: true, passive: true, once: true });
    }

    fallbackId = window.setTimeout(bootOnce, NO_INTERACTION_FALLBACK_MS);
  }

  private bootGtag(): void {
    if (this.booted) {
      return;
    }
    this.booted = true;

    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer.push(args);
    };

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, {
      send_page_view: true,
    });

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        window.gtag?.('config', GA_MEASUREMENT_ID, {
          page_path: event.urlAfterRedirects,
        });
      });
  }
}
