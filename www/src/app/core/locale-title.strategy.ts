import { inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { LocaleService } from './locale.service';
import type { SeoRouteData } from './seo.constants';

@Injectable({ providedIn: 'root' })
export class LocaleTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly locale = inject(LocaleService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const data = this.deepestData(snapshot);
    const pageTitle = data.titleKey ? this.locale.copy[data.titleKey] : this.buildTitle(snapshot);
    if (pageTitle) {
      this.title.setTitle(pageTitle);
    }
  }

  private deepestData(snapshot: RouterStateSnapshot): SeoRouteData {
    let current = snapshot.root;
    let data = { ...(current.data as SeoRouteData) };
    while (current.firstChild) {
      current = current.firstChild;
      data = { ...data, ...(current.data as SeoRouteData) };
    }
    return data;
  }
}
