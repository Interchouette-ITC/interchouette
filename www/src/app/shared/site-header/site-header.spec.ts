import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { COPY } from '../../core/i18n/catalog';
import { SiteHeader } from './site-header';

describe('SiteHeader', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteHeader],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders brand, News, and Customer login', () => {
    const fixture = TestBed.createComponent(SiteHeader);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.site-header__brand')?.textContent?.trim()).toBe(COPY.en.headerBrand);
    expect(el.querySelector('a[routerlink="/news"]')?.textContent?.trim()).toBe(COPY.en.headerNews);
    expect(el.querySelector('a[routerlink="/login"]')?.textContent?.trim()).toBe(
      COPY.en.headerLogin,
    );
  });
});
