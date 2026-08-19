import { describe, expect, it } from 'vitest';

import { isHttpHref, splitHttpLinks } from './chat.links';

describe('splitHttpLinks', () => {
  it('keeps plain text as a single part', () => {
    expect(splitHttpLinks('hello')).toEqual([{ t: 'hello', href: null }]);
  });

  it('splits an https URL from surrounding text', () => {
    expect(splitHttpLinks('book here https://example.com/meet now')).toEqual([
      { t: 'book here ', href: null },
      { t: 'https://example.com/meet', href: 'https://example.com/meet' },
      { t: ' now', href: null },
    ]);
  });

  it('leaves trailing punctuation outside the href', () => {
    expect(splitHttpLinks('see https://example.com.')).toEqual([
      { t: 'see ', href: null },
      { t: 'https://example.com', href: 'https://example.com' },
      { t: '.', href: null },
    ]);
  });

  it('turns markdown mailto into a labeled link', () => {
    expect(
      splitHttpLinks(
        'write to Greg at [greg@interchouette.com](mailto:greg@interchouette.com) please',
      ),
    ).toEqual([
      { t: 'write to Greg at ', href: null },
      { t: 'greg@interchouette.com', href: 'mailto:greg@interchouette.com' },
      { t: ' please', href: null },
    ]);
  });

  it('turns a bare email into a mailto link', () => {
    expect(splitHttpLinks('mail contact@interchouette.net today')).toEqual([
      { t: 'mail ', href: null },
      { t: 'contact@interchouette.net', href: 'mailto:contact@interchouette.net' },
      { t: ' today', href: null },
    ]);
  });

  it('marks only http(s) as external', () => {
    expect(isHttpHref('https://example.com')).toBe(true);
    expect(isHttpHref('mailto:contact@interchouette.net')).toBe(false);
  });
});
