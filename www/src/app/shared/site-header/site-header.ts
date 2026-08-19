import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';

import { SLACK_JOIN_URL } from '../../core/chat.constants';
import { CustomerSession } from '../../core/customer-session';
import { GisOneTapService } from '../../core/gis-onetap.service';
import { LOCALE_LINKS, localeSwitchHref } from '../../core/locale-href';
import { LocaleService } from '../../core/locale.service';
import { LOCALE_TLDS } from '../../core/seo.constants';
import type { SiteLocale } from '../../core/site-locale';

const BOOKING_QUERY = 'booking';
const BOOKING_INTENT_EVENT = 'interchouette:booking-intent';

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
  private readonly host = inject(ElementRef<HTMLElement>);
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
  protected readonly bookingChatDeepLink = '?booking';
  protected readonly marqueeLive = signal(false);
  protected readonly desktopNav = signal(isDesktopNav());
  protected readonly menuOpen = signal(false);
  protected readonly langOpen = signal(false);

  private marqueeTimer: ReturnType<typeof setTimeout> | null = null;
  private navMql: MediaQueryList | null = null;
  private readonly navClose = this.router.events
    .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
    .subscribe(() => this.closePopovers());

  constructor() {
    afterNextRender(() => {
      this.syncDesktopNav();
      if (typeof matchMedia === 'undefined') {
        return;
      }
      this.navMql = matchMedia('(min-width: 768px)');
      this.navMql.addEventListener('change', this.onNavBreakpoint);
    });
  }

  ngOnInit(): void {
    this.marqueeTimer = setTimeout(() => this.marqueeLive.set(true), 5_000);
  }

  ngOnDestroy(): void {
    if (this.marqueeTimer) {
      clearTimeout(this.marqueeTimer);
    }
    this.navMql?.removeEventListener('change', this.onNavBreakpoint);
    this.navClose.unsubscribe();
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (target && this.host.nativeElement.contains(target)) {
      return;
    }
    this.closePopovers();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.closePopovers();
  }

  protected localeHref(locale: SiteLocale): string {
    const host = typeof location === 'undefined' ? '' : location.hostname;
    return localeSwitchHref(locale, this.router.url, host);
  }

  protected toggleMenu(event: Event): void {
    if (this.desktopNav()) {
      return;
    }
    const next = !this.menuOpen();
    this.menuOpen.set(next);
    if (next) {
      this.langOpen.set(false);
    } else {
      blurTrigger(event);
    }
  }

  protected toggleLang(event: Event): void {
    const next = !this.langOpen();
    this.langOpen.set(next);
    if (next) {
      this.menuOpen.set(false);
    } else {
      blurTrigger(event);
    }
  }

  protected onClientLogin(): void {
    this.closePopovers();
    this.gis.openSignIn();
  }

  protected onMenuNavigate(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('a, button')) {
      this.closePopovers();
    }
  }

  protected onBookingCta(event: MouseEvent): void {
    event.preventDefault();
    this.setBookingQueryFlag();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(BOOKING_INTENT_EVENT));
    }
  }

  private closePopovers(): void {
    this.langOpen.set(false);
    if (!this.desktopNav()) {
      this.menuOpen.set(false);
    }
    blurHeaderTrigger();
  }

  private syncDesktopNav(): void {
    this.desktopNav.set(isDesktopNav());
    if (this.desktopNav()) {
      this.menuOpen.set(false);
    }
  }

  private readonly onNavBreakpoint = (): void => {
    this.syncDesktopNav();
  };

  private setBookingQueryFlag(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const parts = window.location.search
      .slice(1)
      .split('&')
      .map((part) => part.trim())
      .filter((part) => part !== '' && part !== 'booking' && part !== 'booking=');
    const nextSearch = `?${[BOOKING_QUERY, ...parts].join('&')}`;
    const next = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    const now = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== now) {
      window.history.replaceState({}, '', next);
    }
  }
}

function isDesktopNav(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(min-width: 768px)').matches;
}

function blurTrigger(event: Event): void {
  const el = event.currentTarget;
  if (el instanceof HTMLElement) {
    el.blur();
  }
}

function blurHeaderTrigger(): void {
  if (typeof document === 'undefined') {
    return;
  }
  const el = document.activeElement;
  if (el instanceof HTMLElement && el.closest('app-site-header')) {
    el.blur();
  }
}
