import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { GA_MEASUREMENT_ID } from './analytics.constants';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  afterEach(() => {
    document.head.querySelectorAll('script[src*="googletagmanager.com"]').forEach((el) => el.remove());
    delete (window as { gtag?: unknown }).gtag;
    delete (window as { dataLayer?: unknown }).dataLayer;
  });

  it('boots gtag once in the browser and ignores a second init', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), AnalyticsService],
    });
    const analytics = TestBed.inject(AnalyticsService);

    analytics.init();
    analytics.init();

    const scripts = document.head.querySelectorAll(
      `script[src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"]`,
    );
    expect(scripts.length).toBe(1);
    expect(window.dataLayer?.length).toBeGreaterThan(0);
  });

  it('skips boot on the server platform', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        AnalyticsService,
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    const analytics = TestBed.inject(AnalyticsService);

    analytics.init();

    expect(document.head.querySelector('script[src*="googletagmanager.com"]')).toBeNull();
    expect(window.gtag).toBeUndefined();
  });

  it('sends page_path on NavigationEnd', () => {
    const events$ = new Subject<NavigationEnd>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        AnalyticsService,
        {
          provide: Router,
          useValue: {
            events: events$.asObservable(),
          },
        },
      ],
    });
    const analytics = TestBed.inject(AnalyticsService);
    analytics.init();

    const before = window.dataLayer!.length;
    events$.next(new NavigationEnd(1, '/privacy', '/privacy'));

    expect(window.dataLayer!.length).toBeGreaterThan(before);
    const last = window.dataLayer!.at(-1) as unknown[];
    expect(last).toEqual([
      'config',
      GA_MEASUREMENT_ID,
      { page_path: '/privacy' },
    ]);
  });
});
