import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { CHAT_WIDGET_ENABLED } from './core/chat.constants';
import { ChatWidget } from './shared/chat-widget/chat-widget';
import { ConsentBanner } from './shared/consent-banner/consent-banner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ChatWidget, ConsentBanner],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly chatEnabled = CHAT_WIDGET_ENABLED;
}
