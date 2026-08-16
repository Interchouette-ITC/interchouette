import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { SiteFooter } from './site-footer';

describe('SiteFooter', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteFooter],
      providers: [
        provideRouter([
          { path: '', component: SiteFooter },
          { path: 'about', component: SiteFooter },
        ]),
      ],
    }).compileComponents();
  });

  it('shows year, Home, About, Privacy, Terms links', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/about');
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const year = String(new Date().getFullYear());

    expect(el.textContent).toContain(year);
    expect(el.textContent).toContain('Interchouette');
    expect(el.querySelector('a[routerlink="/"]')?.textContent).toContain('Home');
    expect(el.querySelector('a[routerlink="/about"]')?.textContent).toContain('About');
    expect(el.querySelector('a[routerlink="/privacy"]')?.textContent).toContain('Privacy');
    expect(el.querySelector('a[routerlink="/terms"]')?.textContent).toContain('Terms');
  });

  it('includes a Home link in the footer markup', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.detectChanges();
    const home = fixture.nativeElement.querySelector('a[routerlink="/"]') as HTMLAnchorElement;

    expect(home?.textContent).toContain('Home');
    expect(fixture.nativeElement.querySelector('.site-footer__home-wrap')).toBeTruthy();
  });
});
