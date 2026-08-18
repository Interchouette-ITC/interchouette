import { describe, expect, it } from 'vitest';

import {
  decodeGisState,
  encodeGisState,
  gisAuthorizeUrl,
  gisCallbackUri,
  isAllowedReturnHref,
  isGisCallbackPath,
  jwtNonce,
  parseGisReturnHash,
  usesLocalGisPicker,
  withGisReturnHash,
} from './gis-oauth';

function jwtWithPayload(payload: object): string {
  const json = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
  return `hdr.${json}.sig`;
}

const profile = {
  sub: 'sub-9',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  picture: 'https://example.com/ada.png',
};

describe('gis oauth redirect', () => {
  it('sends Google to the apex .net callback', () => {
    expect(gisCallbackUri()).toBe('https://interchouette.net/gis-signin');
    const url = new URL(
      gisAuthorizeUrl('client.apps.googleusercontent.com', 'https://interchouette.fr/', 'n1'),
    );
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://interchouette.net/gis-signin');
    expect(url.searchParams.get('response_type')).toBe('id_token');
    expect(url.searchParams.get('nonce')).toBe('n1');
    expect(decodeGisState(url.searchParams.get('state'))).toEqual({
      nonce: 'n1',
      returnHref: 'https://interchouette.fr/',
    });
  });

  it('allows locale TLD returns and rejects other hosts', () => {
    expect(isAllowedReturnHref('https://interchouette.fr/news')).toBe(true);
    expect(isAllowedReturnHref('https://interchouette.nl/')).toBe(true);
    expect(isAllowedReturnHref('https://evil.example/')).toBe(false);
    expect(isAllowedReturnHref('http://interchouette.fr/')).toBe(false);
    expect(decodeGisState(encodeGisState('https://evil.example/', 'n'))).toBeNull();
  });

  it('round-trips the profile hash for the starting TLD', () => {
    const href = withGisReturnHash('https://interchouette.fr/about', profile, 'n1');
    expect(href.startsWith('https://interchouette.fr/about')).toBe(true);
    expect(parseGisReturnHash(new URL(href).hash, 'n1')).toEqual(profile);
    expect(parseGisReturnHash(new URL(href).hash, 'other')).toBeNull();
  });

  it('reads nonce from the id_token', () => {
    expect(jwtNonce(jwtWithPayload({ nonce: 'n1', sub: 'x' }))).toBe('n1');
    expect(jwtNonce('nope')).toBeNull();
  });

  it('keeps the local picker on localhost', () => {
    expect(usesLocalGisPicker('127.0.0.1')).toBe(true);
    expect(usesLocalGisPicker('interchouette.fr')).toBe(false);
    expect(isGisCallbackPath('/gis-signin#id_token=x')).toBe(true);
    expect(isGisCallbackPath('/account')).toBe(false);
  });
});
