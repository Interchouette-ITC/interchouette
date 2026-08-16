import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink],
  templateUrl: './site-footer.html',
  styleUrl: './site-footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooter {
  /** Show Privacy / Terms links (legal pages). */
  readonly showLegalLinks = input(false);

  /** Calendar year for copyright line. */
  readonly currentYear = new Date().getFullYear();
}
