export type SiteLocale = 'en' | 'nl' | 'fr';

/** Hostname TLD (and localhost `?lang=`) for chat + later site copy. */
export function siteLocale(hostname?: string, search?: string): SiteLocale {
  const query = search ?? (typeof location === 'undefined' ? '' : location.search);
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const q = params.get('lang');
  if (q === 'nl' || q === 'fr' || q === 'en') {
    return q;
  }
  const host = hostname ?? (typeof location === 'undefined' ? '' : location.hostname);
  if (host.endsWith('.nl')) {
    return 'nl';
  }
  if (host.endsWith('.fr')) {
    return 'fr';
  }
  return 'en';
}
