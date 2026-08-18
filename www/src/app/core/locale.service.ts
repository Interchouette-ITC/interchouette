import { Injectable } from '@angular/core';

import { COPY, type SiteCopy } from './i18n/catalog';
import { siteLocale, type SiteLocale } from './site-locale';

@Injectable({ providedIn: 'root' })
export class LocaleService {
  readonly locale: SiteLocale = siteLocale();
  readonly copy: SiteCopy = COPY[this.locale];
}
