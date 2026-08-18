import {
  DOCUMENT,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';

import { CHAT_WIDGET_ENABLED } from './core/chat.constants';
import { isGisCallbackPath } from './core/gis-oauth';
import { GisOneTapService } from './core/gis-onetap.service';
import { ChatWidget } from './shared/chat-widget/chat-widget';
import { ConsentBanner } from './shared/consent-banner/consent-banner';
import { SiteHeader } from './shared/site-header/site-header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SiteHeader, ChatWidget, ConsentBanner],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly chatEnabled = CHAT_WIDGET_ENABLED;
  protected readonly bareChrome = signal(false);

  constructor() {
    const doc = inject(DOCUMENT);
    const gis = inject(GisOneTapService);
    const router = inject(Router);
    this.bareChrome.set(isGisCallbackPath(router.url));
    router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.bareChrome.set(isGisCallbackPath(event.urlAfterRedirects));
      });
    afterNextRender(() => {
      doc.documentElement.classList.add('app-ready');
      gis.preload();
    });
  }
}
