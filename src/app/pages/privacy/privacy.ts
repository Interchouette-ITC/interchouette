import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SiteFooter } from '../../shared/site-footer/site-footer';

@Component({
  selector: 'app-privacy-page',
  imports: [RouterLink, SiteFooter],
  templateUrl: './privacy.html',
  styleUrl: './privacy.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPage {}
