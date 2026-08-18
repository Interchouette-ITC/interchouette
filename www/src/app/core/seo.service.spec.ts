import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';

import { routes } from '../app.routes';
import { SITE_ORIGIN } from './seo.constants';
import { SeoService } from './seo.service';

describe('SeoService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), SeoService],
    });
    TestBed.inject(SeoService).init();
  });

  it('sets canonical and description for terms', async () => {
    const router = TestBed.inject(Router);
    const meta = TestBed.inject(Meta);
    const title = TestBed.inject(Title);

    await router.navigateByUrl('/terms');
    TestBed.inject(SeoService).apply();

    expect(title.getTitle()).toContain('Terms');
    expect(meta.getTag('name="description"')?.content).toMatch(/Terms of Service/i);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${SITE_ORIGIN}/terms`,
    );
    expect(meta.getTag('property="og:url"')?.content).toBe(`${SITE_ORIGIN}/terms`);
    const nl = document.head.querySelector('link[rel="alternate"][hreflang="nl"]');
    const xDefault = document.head.querySelector('link[rel="alternate"][hreflang="x-default"]');
    expect(nl?.getAttribute('href')).toBe('https://interchouette.nl/terms');
    expect(xDefault?.getAttribute('href')).toBe(`${SITE_ORIGIN}/terms`);
  });
});
