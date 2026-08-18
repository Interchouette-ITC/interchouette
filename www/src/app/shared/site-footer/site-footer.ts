import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { LocaleService } from '../../core/locale.service';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './site-footer.html',
  styleUrl: './site-footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    ngSkipHydration: 'true',
  },
})
export class SiteFooter {
  /** Calendar year for copyright line. */
  readonly currentYear = new Date().getFullYear();
  protected readonly copy = inject(LocaleService).copy;
}
