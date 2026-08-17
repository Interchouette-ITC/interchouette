import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GIS_CLIENT_ID } from '../../core/gis.constants';
import { LocaleService } from '../../core/locale.service';
import { SiteFooter } from '../../shared/site-footer/site-footer';

@Component({
  selector: 'app-login-page',
  imports: [RouterLink, SiteFooter],
  templateUrl: './login.html',
  styleUrl: '../inner-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  protected readonly copy = inject(LocaleService).copy;
  protected readonly gisConfigured = GIS_CLIENT_ID.length > 0;
}
