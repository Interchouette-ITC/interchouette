import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SiteFooter } from '../../shared/site-footer/site-footer';

@Component({
  selector: 'app-terms-page',
  imports: [RouterLink, SiteFooter],
  templateUrl: './terms.html',
  styleUrl: './terms.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsPage {}
