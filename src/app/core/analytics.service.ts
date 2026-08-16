import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

import { GA_MEASUREMENT_ID } from './analytics.constants';

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
  private booted = false;
  private arming = false;

  /**
   * Same GA4 tag as live interchouette.net (`G-TGZKWJK2D3`).
   * Browser only: first interaction, or a late fallback if nobody interacts.
   */
  init(): void {
    if (this.booted || this.arming || !isPlatformBrowser(this.platformId)) {
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

    // Do not use requestIdleCallback here: it fires as soon as the main thread
    // is quiet and pulls gtag into the Lighthouse "unused JS" window.
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
