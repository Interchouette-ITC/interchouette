import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GA_MEASUREMENT_ID } from './analytics.constants';
import { AnalyticsService } from './analytics.service';
import { CONSENT_STORAGE_KEY } from './chat.constants';
import { ConsentService } from './consent.service';

describe('AnalyticsService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted');
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    document.head
      .querySelectorAll('script[src*="googletagmanager.com"]')
      .forEach((el) => el.remove());
    delete (window as { gtag?: unknown }).gtag;
    delete (window as { dataLayer?: unknown }).dataLayer;
  });

  it('does not boot gtag until interaction or late fallback', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), AnalyticsService, ConsentService],
    });
    const analytics = TestBed.inject(AnalyticsService);

    analytics.init();
    analytics.init();

    expect(document.head.querySelector('script[src*="googletagmanager.com"]')).toBeNull();

    window.dispatchEvent(new Event('pointerdown'));

    const scripts = document.head.querySelectorAll(
      `script[src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"]`,
    );
    expect(scripts.length).toBe(1);
    expect(window.dataLayer?.length).toBeGreaterThan(0);
  });

  it('does not boot gtag when consent was rejected', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'rejected');
    TestBed.configureTestingModule({
      providers: [provideRouter([]), AnalyticsService, ConsentService],
    });
    const analytics = TestBed.inject(AnalyticsService);
    analytics.init();
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(12_000);

    expect(document.head.querySelector('script[src*="googletagmanager.com"]')).toBeNull();
  });

  it('boots via late fallback when there is no interaction', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), AnalyticsService, ConsentService],
    });
    const analytics = TestBed.inject(AnalyticsService);
    analytics.init();

    expect(document.head.querySelector('script[src*="googletagmanager.com"]')).toBeNull();

    vi.advanceTimersByTime(12_000);

    expect(
      document.head.querySelector(
        `script[src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"]`,
      ),
    ).not.toBeNull();
  });

  it('skips boot on the server platform', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        AnalyticsService,
        ConsentService,
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    const analytics = TestBed.inject(AnalyticsService);

    analytics.init();
    vi.advanceTimersByTime(12_000);

    expect(document.head.querySelector('script[src*="googletagmanager.com"]')).toBeNull();
    expect(window.gtag).toBeUndefined();
  });

  it('sends page_path on NavigationEnd after boot', () => {
    const events$ = new Subject<NavigationEnd>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        AnalyticsService,
        ConsentService,
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
    window.dispatchEvent(new Event('pointerdown'));

    const before = window.dataLayer!.length;
    events$.next(new NavigationEnd(1, '/privacy', '/privacy'));

    expect(window.dataLayer!.length).toBeGreaterThan(before);
  });
});
