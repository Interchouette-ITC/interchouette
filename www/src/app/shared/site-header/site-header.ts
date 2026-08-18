import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { SLACK_JOIN_URL } from '../../core/chat.constants';
import { CustomerSession } from '../../core/customer-session';
import { GisOneTapService } from '../../core/gis-onetap.service';
import { LOCALE_LINKS, localeSwitchHref } from '../../core/locale-href';
import { LocaleService } from '../../core/locale.service';
import { LOCALE_TLDS } from '../../core/seo.constants';
import type { SiteLocale } from '../../core/site-locale';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './site-header.html',
  styleUrl: './site-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    ngSkipHydration: 'true',
  },
})
export class SiteHeader implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly locale = inject(LocaleService);
  protected readonly copy = this.locale.copy;
  protected readonly currentLocale = this.locale.locale;
  protected readonly tld = LOCALE_TLDS[this.locale.locale];
  protected readonly brandHost = `interchouette.${this.tld}`;
  protected readonly langs = LOCALE_LINKS;
  protected readonly currentCode =
    LOCALE_LINKS.find((item) => item.locale === this.currentLocale)?.code ?? 'EN';
  protected readonly session = inject(CustomerSession);
  private readonly gis = inject(GisOneTapService);
  protected readonly slackJoinUrl = SLACK_JOIN_URL;
  protected readonly marqueeLive = signal(false);

  private marqueeTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.marqueeTimer = setTimeout(() => this.marqueeLive.set(true), 5_000);
  }

  ngOnDestroy(): void {
    if (this.marqueeTimer) {
      clearTimeout(this.marqueeTimer);
    }
  }

  protected localeHref(locale: SiteLocale): string {
    const host = typeof location === 'undefined' ? '' : location.hostname;
    return localeSwitchHref(locale, this.router.url, host);
  }

  protected onClientLogin(): void {
    this.gis.openSignIn();
  }
}
