/** Public site origin (canonical + Open Graph). */
export const SITE_ORIGIN = 'https://interchouette.net';

/** Default social preview image. */
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/img/avatar.webp`;

/** Route `data` keys consumed by SeoService. */
export interface SeoRouteData {
  description: string;
  ogType?: 'website' | 'profile';
  robots?: string;
}
