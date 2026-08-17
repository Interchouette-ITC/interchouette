import type { SiteLocale } from '../site-locale';
import { EN, type SiteCopy } from './en';
import { FR } from './fr';
import { NL } from './nl';

export type { SiteCopy } from './en';

export const COPY: Record<SiteLocale, SiteCopy> = {
  en: EN,
  nl: NL,
  fr: FR,
};
