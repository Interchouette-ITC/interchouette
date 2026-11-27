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
    const archiveLinks = el.querySelectorAll('a[routerlink="/archive"]');
    expect(archiveLinks.length).toBe(2);
    expect(archiveLinks[0]?.textContent?.trim()).toBe(COPY.en.news.archiveLink);
    expect(el.querySelector('.news-archive-nav')).toBeTruthy();
    expect(el.querySelector('.news-meta--archive')).toBeTruthy();
    expect(loadSpy).toHaveBeenCalled();
    const tabs = Array.from(el.querySelectorAll('[role="tab"]')).map((tab) =>
      tab.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(tabs[0]).toContain('LinkedIn');
  });

  it('shows a friendly warning with retained posts and hides raw source errors', () => {
    const news = TestBed.inject(NewsService);
    vi.spyOn(news, 'load').mockImplementation(() => undefined);
    news.feeds.set({
      itc_linkedin: {
        profile_url: 'https://www.linkedin.com/company/interchouette-itc/',
        error: 'fetch returned HTTP 403 Forbidden',
        items: [{ id: '1', text: 'Previous post', url: 'https://example.com/post' }],
      },
      itc_x: {
        profile_url: 'https://x.com/interchouette',
        error: 'X timeline could not be parsed',
        items: [],
      },
    });
    const fixture = TestBed.createComponent(NewsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain(COPY.en.news.stale);
    expect(el.textContent).toContain('Previous post');
    expect(el.textContent).toContain(COPY.en.news.error);
    expect(el.textContent).not.toContain('403 Forbidden');
    expect(el.textContent).not.toContain('could not be parsed');
  });
});
