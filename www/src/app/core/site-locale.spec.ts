import { describe, expect, it } from 'vitest';

import { siteLocale } from './site-locale';

describe('siteLocale', () => {
  it('maps TLD to locale', () => {
    expect(siteLocale('interchouette.net', '')).toBe('en');
    expect(siteLocale('www.interchouette.nl', '')).toBe('nl');
    expect(siteLocale('interchouette.fr', '')).toBe('fr');
  });

  it('honors localhost lang query', () => {
    expect(siteLocale('127.0.0.1', '?lang=nl')).toBe('nl');
    expect(siteLocale('localhost', 'lang=fr')).toBe('fr');
    expect(siteLocale('localhost', '?lang=de')).toBe('en');
  });
});
