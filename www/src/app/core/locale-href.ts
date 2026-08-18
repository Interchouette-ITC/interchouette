import { LOCALE_ORIGINS } from './seo.constants';
import type { SiteLocale } from './site-locale';

/** Public locale switcher rows for the header flag menu. */
export const LOCALE_LINKS: readonly {
  locale: SiteLocale;
  host: string;
  label: string;
}[] = [
  { locale: 'en', host: 'interchouette.net', label: 'English' },
  { locale: 'nl', host: 'interchouette.nl', label: 'Nederlands' },
  { locale: 'fr', host: 'interchouette.fr', label: 'Français' },
];

export function isLocalDevHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/** Same path on the other TLD in production; `?lang=` on localhost. */
export function localeSwitchHref(locale: SiteLocale, routerUrl: string, hostname: string): string {
  const path = routerUrl.split('?')[0] || '/';
  const normalized = path === '/' ? '/' : path.replace(/\/$/, '');
  if (isLocalDevHost(hostname)) {
    return `${normalized}?lang=${locale}`;
  }
  return `${LOCALE_ORIGINS[locale]}${normalized}`;
}
