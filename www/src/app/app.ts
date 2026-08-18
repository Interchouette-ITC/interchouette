import {
  DOCUMENT,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { CHAT_WIDGET_ENABLED } from './core/chat.constants';
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

  constructor() {
    const doc = inject(DOCUMENT);
    const gis = inject(GisOneTapService);
    afterNextRender(() => {
      doc.documentElement.classList.add('app-ready');
      gis.preload();
    });
  }
}
