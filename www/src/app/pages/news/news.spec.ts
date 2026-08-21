import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { COPY } from '../../core/i18n/catalog';
import { NewsService } from '../../core/news.service';
import { NewsPage } from './news';

describe('NewsPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewsPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders title and tab labels', () => {
    const news = TestBed.inject(NewsService);
    const loadSpy = vi.spyOn(news, 'load').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(NewsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent?.trim()).toBe(COPY.en.news.title);
    expect(el.textContent).toContain(COPY.en.news.tabItcX);
    expect(el.textContent).toContain(COPY.en.news.tabItcLinkedIn);
    expect(el.querySelector('.news-sources .fa-linkedin')).toBeTruthy();
    expect(el.querySelector('.news-sources .fa-twitter')).toBeTruthy();
    expect(el.querySelector('a[routerlink="/archive"]')?.textContent?.trim()).toBe(
      COPY.en.news.archiveLink,
    );
    expect(loadSpy).toHaveBeenCalled();
  });
});
