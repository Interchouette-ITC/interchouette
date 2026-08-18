import { describe, expect, it } from 'vitest';

import { consumeGisSignInQuery, gisSignInHref, isGisLoginHost } from './gis-origin';

describe('isGisLoginHost', () => {
  it('allows localhost and apex .net', () => {
    expect(isGisLoginHost('localhost')).toBe(true);
    expect(isGisLoginHost('127.0.0.1')).toBe(true);
    expect(isGisLoginHost('interchouette.net')).toBe(true);
  });

  it('rejects locale TLDs and www', () => {
    expect(isGisLoginHost('interchouette.fr')).toBe(false);
    expect(isGisLoginHost('www.interchouette.fr')).toBe(false);
    expect(isGisLoginHost('interchouette.nl')).toBe(false);
    expect(isGisLoginHost('www.interchouette.net')).toBe(false);
  });
});

describe('gisSignInHref', () => {
  it('returns null on GIS hosts', () => {
    expect(gisSignInHref('localhost', '/')).toBeNull();
    expect(gisSignInHref('interchouette.net', '/account')).toBeNull();
  });

  it('sends locale hosts to apex .net with signin=1', () => {
    expect(gisSignInHref('interchouette.fr', '/')).toBe('https://interchouette.net/?signin=1');
    expect(gisSignInHref('www.interchouette.nl', '/account')).toBe(
      'https://interchouette.net/account?signin=1',
    );
  });
});

describe('consumeGisSignInQuery', () => {
  it('strips signin=1 and reports open', () => {
    let next = '';
    expect(
      consumeGisSignInQuery('https://interchouette.net/?signin=1', (url) => {
        next = url;
      }),
    ).toBe(true);
    expect(next).toBe('/');
  });

  it('leaves other URLs alone', () => {
    let called = false;
    expect(
      consumeGisSignInQuery('https://interchouette.net/account', () => {
        called = true;
      }),
    ).toBe(false);
    expect(called).toBe(false);
  });
});
