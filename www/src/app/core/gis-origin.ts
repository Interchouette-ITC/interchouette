import { isLocalDevHost } from './locale-href';
import { SITE_ORIGIN } from './seo.constants';

/** Query that opens the Google picker after landing on the canonical GIS host. */
export const GIS_SIGNIN_PARAM = 'signin';

/**
 * Google Identity Services binds the popup to this page origin.
 * Login runs on localhost or apex interchouette.net only.
 */
export function isGisLoginHost(hostname: string): boolean {
  return isLocalDevHost(hostname) || hostname === 'interchouette.net';
}

function consumeSignInParam(href: string): { next: string; open: boolean } {
  const url = new URL(href, SITE_ORIGIN);
  const open = url.searchParams.get(GIS_SIGNIN_PARAM) === '1';
  if (!open) {
    return { next: href, open: false };
  }
  url.searchParams.delete(GIS_SIGNIN_PARAM);
  return { next: `${url.pathname}${url.search}${url.hash}`, open: true };
}

/** Strip `?signin=1` from the current URL. Returns true when GIS should open. */
export function consumeGisSignInQuery(href: string, replace: (url: string) => void): boolean {
  const { next, open } = consumeSignInParam(href);
  if (!open) {
    return false;
  }
  replace(next);
  return true;
}

/**
 * Absolute .net URL that opens GIS after landing.
 * GIS hosts return null (popup stays on this origin).
 */
export function gisSignInHref(hostname: string, path = '/'): string | null {
  if (isGisLoginHost(hostname)) {
    return null;
  }
  const raw = path.split('?')[0] || '/';
  const normalized = raw === '/' ? '/' : raw.replace(/\/$/, '');
  const url = new URL(`${SITE_ORIGIN}${normalized}`);
  url.searchParams.set(GIS_SIGNIN_PARAM, '1');
  return url.toString();
}
