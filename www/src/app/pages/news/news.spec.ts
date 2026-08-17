import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { COPY } from '../../core/i18n/catalog';
import { NewsPage } from './news';

describe('NewsPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewsPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the empty News state', () => {
    const fixture = TestBed.createComponent(NewsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent?.trim()).toBe(COPY.en.newsTitle);
    expect(el.textContent).toContain(COPY.en.newsEmpty);
  });
});
