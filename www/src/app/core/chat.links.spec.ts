import { describe, expect, it } from 'vitest';

import { splitHttpLinks } from './chat.links';

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
});
