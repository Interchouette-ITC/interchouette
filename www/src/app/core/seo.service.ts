import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

import { LocaleService } from './locale.service';
import { DEFAULT_OG_IMAGE, LOCALE_ORIGINS, SITE_ORIGIN, type SeoRouteData } from './seo.constants';
import { API_ORIGIN } from './chat.constants';

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly doc = inject(DOCUMENT);
  private readonly locale = inject(LocaleService);
  private booted = false;

  /** Apply SEO tags on every navigation (browser + prerender). */
  init(): void {
    if (this.booted) {
      return;
    }
    this.booted = true;

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.apply());
    this.apply();
  }

  apply(): void {
    const leaf = this.leafRoute();
    const path = this.router.url.split('?')[0] || '/';
    const seo = (leaf.snapshot.data ?? {}) as SeoRouteData;
    const copy = this.locale.copy;
    const pageTitle = seo.titleKey ? copy[seo.titleKey] : this.title.getTitle();
    const description =
      (seo.descriptionKey ? copy[seo.descriptionKey] : seo.description) ?? copy.descHome;
    const origin = LOCALE_ORIGINS[this.locale.locale];
    const canonical = `${origin}${path === '/' ? '/' : path.replace(/\/$/, '')}`;
    const ogType = seo.ogType ?? 'website';
    const robots = seo.robots ?? 'index, follow';

    if (seo.titleKey) {
      this.title.setTitle(pageTitle);
    }

    this.doc.documentElement.lang = this.locale.locale;

    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: robots });
    this.meta.updateTag({ property: 'og:type', content: ogType });
    this.meta.updateTag({ property: 'og:site_name', content: 'Interchouette' });
    this.meta.updateTag({ property: 'og:title', content: pageTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.meta.updateTag({ property: 'og:image', content: DEFAULT_OG_IMAGE });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary' });
    this.meta.updateTag({ name: 'twitter:title', content: pageTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: DEFAULT_OG_IMAGE });

    this.setCanonical(canonical);
    this.setHreflang(path);
    this.setFeedAlternates();
  }

  /** Rich meta + JSON-LD for news listing pages (prerender + client). */
  applyPageExtras(extras: {
    title?: string;
    description?: string;
    jsonLd?: Record<string, unknown> | null;
  }): void {
    if (extras.title) {
      this.title.setTitle(extras.title);
      this.meta.updateTag({ property: 'og:title', content: extras.title });
      this.meta.updateTag({ name: 'twitter:title', content: extras.title });
    }
    if (extras.description) {
      this.meta.updateTag({ name: 'description', content: extras.description });
      this.meta.updateTag({ property: 'og:description', content: extras.description });
      this.meta.updateTag({ name: 'twitter:description', content: extras.description });
    }
    this.setJsonLd(extras.jsonLd ?? null);
  }

  private setJsonLd(data: Record<string, unknown> | null): void {
    const head = this.doc.head;
    const id = 'app-page-jsonld';
    const existing = head.querySelector<HTMLScriptElement>(`script#${id}`);
    if (!data) {
      existing?.remove();
      return;
    }
    const script = existing ?? this.doc.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    if (!existing) {
      head.appendChild(script);
    }
  }

  private leafRoute(): ActivatedRoute {
    let current = this.route;
    while (current.firstChild) {
      current = current.firstChild;
    }
    return current;
  }

  private setCanonical(href: string): void {
    const head = this.doc.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  private setHreflang(path: string): void {
    const head = this.doc.head;
    const normalized = path === '/' ? '/' : path.replace(/\/$/, '');
    const suffix = normalized === '/' ? '/' : normalized;
    head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());

    const alts: [string, string][] = [
      ['en', `${LOCALE_ORIGINS.en}${suffix}`],
      ['nl', `${LOCALE_ORIGINS.nl}${suffix}`],
      ['fr', `${LOCALE_ORIGINS.fr}${suffix}`],
      ['x-default', `${SITE_ORIGIN}${suffix}`],
    ];
    for (const [hreflang, href] of alts) {
      const link = this.doc.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', hreflang);
      link.setAttribute('href', href);
      head.appendChild(link);
    }
  }

  /** Keep API RSS/Atom discovery links present across client navigations. */
  private setFeedAlternates(): void {
    const head = this.doc.head;
    const feeds: [string, string, string][] = [
      ['application/rss+xml', 'Interchouette News RSS', `${API_ORIGIN}/v1/news/rss.xml`],
      ['application/atom+xml', 'Interchouette News Atom', `${API_ORIGIN}/v1/news/atom.xml`],
    ];
    for (const [type, title, href] of feeds) {
      let link = head.querySelector<HTMLLinkElement>(
        `link[rel="alternate"][type="${type}"][href="${href}"]`,
      );
      if (!link) {
        link = this.doc.createElement('link');
        link.setAttribute('rel', 'alternate');
        link.setAttribute('type', type);
        link.setAttribute('title', title);
        link.setAttribute('href', href);
        head.appendChild(link);
      }
    }
  }
}
