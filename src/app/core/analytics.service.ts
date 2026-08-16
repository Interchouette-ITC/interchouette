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

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private booted = false;

  /**
   * Same GA4 tag as live interchouette.net (`G-TGZKWJK2D3`).
   * Loads gtag in the browser only (skipped during prerender).
   */
  init(): void {
    if (this.booted || !isPlatformBrowser(this.platformId)) {
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
