import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SiteFooter } from './site-footer';

describe('SiteFooter', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteFooter],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('shows the current year without legal links by default', () => {
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const year = String(new Date().getFullYear());

    expect(el.textContent).toContain(year);
    expect(el.textContent).toContain('Interchouette');
    expect(el.querySelector('a[routerlink="/privacy"]')).toBeNull();
    expect(el.querySelector('a[routerlink="/terms"]')).toBeNull();
  });

  it('shows Privacy and Terms when legal links are enabled', () => {
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.componentRef.setInput('showLegalLinks', true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('a[routerlink="/privacy"]')?.textContent).toContain('Privacy');
    expect(el.querySelector('a[routerlink="/terms"]')?.textContent).toContain('Terms');
  });
});
