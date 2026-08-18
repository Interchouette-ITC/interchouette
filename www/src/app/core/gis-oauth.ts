import type { CustomerProfile } from './customer-session';
import { profileFromUserinfo } from './gis-signin';
import { isLocalDevHost } from './locale-href';
import { SITE_ORIGIN } from './seo.constants';

/** Google redirects here after login. Authorized redirect URI on the OAuth client. */
export const GIS_CALLBACK_PATH = '/gis-signin';
export const GIS_RETURN_PARAM = 'ic_gis';
export const GIS_NONCE_KEY = 'ic.gis.nonce';

const GIS_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';

/** Origins allowed to receive the profile after the .net callback. */
export const GIS_RETURN_ORIGINS: readonly string[] = [
  SITE_ORIGIN,
  'https://www.interchouette.net',
  'https://interchouette.nl',
  'https://www.interchouette.nl',
  'https://interchouette.fr',
  'https://www.interchouette.fr',
];

export function isGisCallbackPath(url: string): boolean {
  const path = url.split('?')[0]?.split('#')[0] ?? '';
  return path === GIS_CALLBACK_PATH || path === `${GIS_CALLBACK_PATH}/`;
}

export function usesLocalGisPicker(hostname: string): boolean {
  return isLocalDevHost(hostname);
}

export function isAllowedReturnHref(href: string): boolean {
  try {
    const url = new URL(href);
    if (url.username || url.password || url.protocol !== 'https:') {
      return false;
    }
    return GIS_RETURN_ORIGINS.includes(url.origin);
  } catch {
    return false;
  }
}

export function gisCallbackUri(): string {
  return `${SITE_ORIGIN}${GIS_CALLBACK_PATH}`;
}

function b64url(json: string): string {
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function fromB64url(raw: string): string {
  const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
  const pad = '='.repeat((4 - (padded.length % 4)) % 4);
  return atob(padded + pad);
}

export function encodeGisState(returnHref: string, nonce: string): string {
  return b64url(JSON.stringify({ returnHref, nonce }));
}

export function decodeGisState(state: string | null): { nonce: string; returnHref: string } | null {
  if (!state) {
    return null;
  }
  try {
    const parsed = JSON.parse(fromB64url(state)) as { nonce?: unknown; returnHref?: unknown };
    if (typeof parsed.nonce !== 'string' || typeof parsed.returnHref !== 'string') {
      return null;
    }
    if (!isAllowedReturnHref(parsed.returnHref)) {
      return null;
    }
    return { nonce: parsed.nonce, returnHref: parsed.returnHref };
  } catch {
    return null;
  }
}

export function gisAuthorizeUrl(clientId: string, returnHref: string, nonce: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: gisCallbackUri(),
    response_type: 'id_token',
    response_mode: 'fragment',
    scope: 'openid email profile',
    nonce,
    state: encodeGisState(returnHref, nonce),
    prompt: 'select_account',
  });
  return `${GIS_AUTH}?${params}`;
}

export function hashParams(hash: string): URLSearchParams {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  return new URLSearchParams(raw);
}

export function jwtNonce(credential: string): string | null {
  const part = credential.split('.')[1];
  if (!part) {
    return null;
  }
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = '='.repeat((4 - (padded.length % 4)) % 4);
    const json = JSON.parse(atob(padded + pad)) as { nonce?: unknown };
    return typeof json.nonce === 'string' ? json.nonce : null;
  } catch {
    return null;
  }
}

export function withGisReturnHash(
  returnHref: string,
  profile: CustomerProfile,
  nonce: string,
): string {
  const url = new URL(returnHref);
  url.hash = `${GIS_RETURN_PARAM}=${encodeURIComponent(JSON.stringify({ nonce, profile }))}`;
  return url.toString();
}

export function parseGisReturnHash(
  hash: string,
  expectedNonce: string | null,
): CustomerProfile | null {
  if (!expectedNonce) {
    return null;
  }
  const raw = hashParams(hash).get(GIS_RETURN_PARAM);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { nonce?: unknown; profile?: unknown };
    if (parsed.nonce !== expectedNonce || typeof parsed.profile !== 'object' || !parsed.profile) {
      return null;
    }
    return profileFromUserinfo(parsed.profile as Record<string, unknown>);
  } catch {
    return null;
  }
}
