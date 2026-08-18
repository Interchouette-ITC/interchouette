import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CustomerSession } from '../../core/customer-session';
import { GisOneTapService } from '../../core/gis-onetap.service';
import { LocaleService } from '../../core/locale.service';
import { SiteFooter } from '../../shared/site-footer/site-footer';

@Component({
  selector: 'app-account-page',
  imports: [RouterLink, SiteFooter],
  templateUrl: './account.html',
  styleUrl: '../inner-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPage {
  protected readonly copy = inject(LocaleService).copy;
  protected readonly session = inject(CustomerSession);
  private readonly gis = inject(GisOneTapService);

  protected onSignIn(): void {
    this.gis.openSignIn();
  }
}
