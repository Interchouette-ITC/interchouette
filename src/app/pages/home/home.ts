import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SiteFooter } from '../../shared/site-footer/site-footer';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, SiteFooter],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  protected readonly mailHref = 'mailto:contact@interchouette.net';
  protected readonly whatsappHref = 'https://wa.me/31620808454';
}
