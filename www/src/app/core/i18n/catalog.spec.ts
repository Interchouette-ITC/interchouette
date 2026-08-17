import { COPY } from './catalog';
import { EN } from './en';

describe('i18n catalogs', () => {
  it('keeps the same keys in every locale', () => {
    const keys = Object.keys(EN).sort();
    expect(Object.keys(COPY.nl).sort()).toEqual(keys);
    expect(Object.keys(COPY.fr).sort()).toEqual(keys);
  });

  it('uses real Dutch and French for chrome, not English copies', () => {
    expect(COPY.nl.headerNews).toBe('Nieuws');
    expect(COPY.fr.headerNews).toBe('Actualités');
    expect(COPY.nl.newsEmpty).not.toBe(COPY.en.newsEmpty);
    expect(COPY.fr.homePromise).toMatch(/Rust/);
    expect(COPY.fr.homePromise).not.toBe(COPY.en.homePromise);
  });
});
