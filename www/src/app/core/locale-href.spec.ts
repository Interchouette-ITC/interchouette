import { describe, expect, it } from 'vitest';

import { localeSwitchHref } from './locale-href';

describe('localeSwitchHref', () => {
  it('uses lang query on localhost', () => {
    expect(localeSwitchHref('nl', '/about', 'localhost')).toBe('/about?lang=nl');
    expect(localeSwitchHref('fr', '/', '127.0.0.1')).toBe('/?lang=fr');
  });

  it('uses production TLD origins off localhost', () => {
    expect(localeSwitchHref('nl', '/about', 'interchouette.net')).toBe(
      'https://interchouette.nl/about',
    );
    expect(localeSwitchHref('en', '/news?x=1', 'interchouette.fr')).toBe(
      'https://interchouette.net/news',
    );
  });
});
