import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { COPY } from '../../core/i18n/catalog';
import { NewsService } from '../../core/news.service';
import { ArchivePage } from './archive';

describe('ArchivePage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArchivePage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders archive title and loads index', () => {
    const news = TestBed.inject(NewsService);
    const loadSpy = vi.spyOn(news, 'loadArchive').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(ArchivePage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent?.trim()).toBe(COPY.en.news.archiveTitle);
    expect(el.querySelector('a[routerlink="/news"]')?.textContent).toContain(
      COPY.en.news.archiveBackToNews,
    );
    expect(loadSpy).toHaveBeenCalled();
  });
});
