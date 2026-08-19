import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type PageBrandMarkSize = 'about' | 'legal';

@Component({
  selector: 'app-page-brand-mark',
  templateUrl: './page-brand-mark.html',
  styleUrl: './page-brand-mark.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.page-brand-mark--about]': 'size() === "about"',
    '[class.page-brand-mark--legal]': 'size() === "legal"',
  },
})
export class PageBrandMark {
  readonly size = input<PageBrandMarkSize>('legal');
}
