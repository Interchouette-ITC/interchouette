import type { SiteCopyStringKey } from './i18n/en';
import type { SiteLocale } from './site-locale';

/** Public site origin (canonical + Open Graph) for English. */
export const SITE_ORIGIN = 'https://interchouette.net';

/** Production origin per TLD locale. */
export const LOCALE_ORIGINS: Record<SiteLocale, string> = {
  en: SITE_ORIGIN,
  nl: 'https://interchouette.nl',
  fr: 'https://interchouette.fr',
};

/** Default social preview image. */
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/img/avatar.webp`;

/** Route `data` keys consumed by SeoService. */
export interface SeoRouteData {
  description: string;
  ogType?: 'website' | 'profile';
  robots?: string;
  titleKey?: SiteCopyStringKey;
  descriptionKey?: SiteCopyStringKey;
}
