import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

import { DEFAULT_OG_IMAGE, SITE_ORIGIN, type SeoRouteData } from './seo.constants';

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly doc = inject(DOCUMENT);
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
  }

  apply(): void {
    const leaf = this.leafRoute();
    const path = this.router.url.split('?')[0] || '/';
    const pageTitle = this.title.getTitle();
    const seo = (leaf.snapshot.data ?? {}) as SeoRouteData;
    const description =
      seo.description ?? 'Gregory Roussac - Rust / Wasm Freelance Developer - Interchouette - ITC';
    const canonical = `${SITE_ORIGIN}${path === '/' ? '/' : path.replace(/\/$/, '')}`;
    const ogType = seo.ogType ?? 'website';
    const robots = seo.robots ?? 'index, follow';

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
}
