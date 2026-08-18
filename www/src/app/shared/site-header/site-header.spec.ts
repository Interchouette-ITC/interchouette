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

  it('renders News and Client login on the right', () => {
    const fixture = TestBed.createComponent(SiteHeader);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const login = el.querySelector('button.site-header__login') as HTMLButtonElement | null;

    expect(el.querySelector('.site-header__brand')?.getAttribute('aria-label')).toBe(
      'interchouette.net',
    );
    expect(el.querySelector('a[routerlink="/news"]')?.textContent?.trim()).toBe(COPY.en.headerNews);
    expect(login?.getAttribute('title')).toBe(COPY.en.titleLogin);
    expect(login?.textContent?.trim()).toBe(COPY.en.headerLogin);
    expect(el.querySelector('.site-header__lang summary')?.getAttribute('aria-label')).toBe(
      COPY.en.headerLang,
    );
    expect(el.querySelector('.site-header__lang .is-current')?.textContent).toContain('English');
    expect(el.querySelector('.site-header__lang a')?.textContent).toContain('Nederlands');
  });
});
