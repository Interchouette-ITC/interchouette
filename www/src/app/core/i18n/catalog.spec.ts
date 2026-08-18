import { COPY, fillCopy } from './catalog';
import { EN } from './en';

function keysOf(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return keysOf(value as object, path);
    }
    return [path];
  });
}

describe('i18n catalogs', () => {
  it('keeps the same keys in every locale', () => {
    const keys = keysOf(EN).sort();
    expect(keysOf(COPY.nl).sort()).toEqual(keys);
    expect(keysOf(COPY.fr).sort()).toEqual(keys);
  });

  it('uses real Dutch and French for chrome, not English copies', () => {
    expect(COPY.nl.headerNews).toBe('Nieuws');
    expect(COPY.fr.headerNews).toBe('Actualités');
    expect(COPY.en.headerMenu).toBe('Menu');
    expect(COPY.nl.headerMenu).toBe('Menu');
    expect(COPY.fr.headerMenu).toBe('Menu');
    expect(COPY.nl.newsEmpty).not.toBe(COPY.en.newsEmpty);
    expect(COPY.fr.homePromise).toMatch(/produit/);
    expect(COPY.fr.homePromise).not.toBe(COPY.en.homePromise);
    expect(COPY.nl.about.title).toMatch(/Over/);
    expect(COPY.fr.privacy.gisHeading).toMatch(/Google/);
    expect(COPY.nl.consent.jokes.length).toBe(COPY.en.consent.jokes.length);
    expect(COPY.nl.headerHomeTitle).toContain('.nl');
    expect(COPY.fr.headerHomeTitle).toContain('.fr');
    expect(COPY.fr.footerPrivacy).toBe('Vie privée');
    expect(COPY.fr.footerTerms).toBe('CGU');
    expect(COPY.nl.footerTerms).toBe('AV');
    expect(COPY.fr.chat.nudgeHooks.length).toBe(COPY.en.chat.nudgeHooks.length);
  });

  it('keeps CV document titles in English on every locale', () => {
    expect(COPY.nl.titleCv).toBe(COPY.en.titleCv);
    expect(COPY.fr.titleCv).toBe(COPY.en.titleCv);
    expect(COPY.nl.descCv).toBe(COPY.en.descCv);
    expect(COPY.fr.descCv).toBe(COPY.en.descCv);
  });

  it('fills catalog tokens', () => {
    expect(fillCopy('Hi {who} at {email}', { who: 'Greg', email: 'a@b.c' })).toBe(
      'Hi Greg at a@b.c',
    );
  });
});
