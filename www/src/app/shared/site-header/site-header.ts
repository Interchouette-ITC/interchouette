import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { SLACK_JOIN_URL } from '../../core/chat.constants';
import { CustomerSession } from '../../core/customer-session';
import { LocaleService } from '../../core/locale.service';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './site-header.html',
  styleUrl: './site-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteHeader implements OnInit, OnDestroy {
  protected readonly copy = inject(LocaleService).copy;
  protected readonly session = inject(CustomerSession);
  protected readonly slackJoinUrl = SLACK_JOIN_URL;
  protected readonly marqueeLive = signal(false);

  private marqueeTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.marqueeTimer = setTimeout(() => this.marqueeLive.set(true), 5_000);
  }

  ngOnDestroy(): void {
    if (this.marqueeTimer) {
      clearTimeout(this.marqueeTimer);
    }
  }
}
