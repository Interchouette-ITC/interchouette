import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { LocaleService } from '../../core/locale.service';
import { SiteFooter } from '../../shared/site-footer/site-footer';

@Component({
  selector: 'app-news-page',
  imports: [RouterLink, SiteFooter],
  templateUrl: './news.html',
  styleUrl: '../inner-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsPage {
  protected readonly copy = inject(LocaleService).copy;
}
