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
    expect(el.querySelector('.site-header__menu-btn')?.getAttribute('aria-label')).toBe(
      COPY.en.headerMenu,
    );
    expect(el.querySelector('a[routerlink="/news"]')?.textContent?.trim()).toBe(COPY.en.headerNews);
    expect(login?.getAttribute('title')).toBe(COPY.en.titleLogin);
    expect(login?.textContent?.trim()).toBe(COPY.en.headerLogin);
    expect(el.querySelector('a.site-header__slack')?.textContent?.trim()).toBe(COPY.en.headerSlack);
    expect(el.querySelector('.site-header__lang-btn')?.getAttribute('aria-label')).toBe(
      COPY.en.headerLang,
    );
    expect(el.querySelector('.site-header__lang-btn')?.textContent?.trim()).toBe('EN');
    expect(el.querySelector('.site-header__lang-code')?.textContent?.trim()).toBe('EN');
    expect(el.querySelector('.site-header__flag')).toBeNull();
    expect(el.querySelector('.site-header__lang .is-current')?.textContent).toContain('English');
    expect(el.querySelector('.site-header__lang a')?.textContent).toContain('Nederlands');
  });

  it('opens one header popover at a time', () => {
    const fixture = TestBed.createComponent(SiteHeader);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const menuBtn = el.querySelector('.site-header__menu-btn') as HTMLButtonElement;
    const langBtn = el.querySelector('.site-header__lang-btn') as HTMLButtonElement;

    menuBtn.click();
    fixture.detectChanges();
    expect(menuBtn.getAttribute('aria-expanded')).toBe('true');
    expect(langBtn.getAttribute('aria-expanded')).toBe('false');

    langBtn.click();
    fixture.detectChanges();
    expect(menuBtn.getAttribute('aria-expanded')).toBe('false');
    expect(langBtn.getAttribute('aria-expanded')).toBe('true');
  });
});
