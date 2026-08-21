import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AboutPage } from './about';

describe('AboutPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AboutPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the about heading, intro lead, tabs, and legal links', () => {
    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent).toMatch(/about/i);
    expect(el.textContent).toContain('Re-founded as ZZP in 2022');
    expect(el.querySelector('[role="tablist"]')).toBeTruthy();
    expect(el.querySelectorAll('[role="tab"]').length).toBe(5);
    expect(el.textContent).toContain('Rust-first systems work');
    expect(el.querySelector('a[href="https://github.com/Interchouette-ITC"]')).toBeTruthy();
    expect(
      el.querySelector('a[href="https://www.linkedin.com/company/interchouette-itc"]'),
    ).toBeTruthy();
    expect(el.querySelector('a[routerlink="/privacy"], a[href="/privacy"]')).toBeTruthy();
    expect(el.querySelector('a[routerlink="/terms"], a[href="/terms"]')).toBeTruthy();
    expect(el.querySelector('a.back[routerlink="/"], a.back[href="/"]')).toBeTruthy();
    expect(el.querySelector('app-page-brand-mark')).toBeTruthy();
  });

  it('switches tab panels when a tab is clicked', () => {
    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const aboutPanel = el.querySelector('#about-panel-about') as HTMLElement;
    const workPanel = el.querySelector('#about-panel-work') as HTMLElement;
    expect(aboutPanel).toBeTruthy();
    expect(workPanel).toBeTruthy();
    expect(aboutPanel.hasAttribute('hidden')).toBe(false);
    expect(workPanel.hasAttribute('hidden')).toBe(true);

    const workTab = el.querySelector('#about-tab-work') as HTMLButtonElement;
    workTab.click();
    fixture.detectChanges();

    expect(workPanel.hasAttribute('hidden')).toBe(false);
    expect(aboutPanel.hasAttribute('hidden')).toBe(true);
    expect(workTab.getAttribute('aria-selected')).toBe('true');
    expect(el.textContent).toContain('tvscreener-rs');

    const siteTab = el.querySelector('#about-tab-site') as HTMLButtonElement;
    siteTab.click();
    fixture.detectChanges();

    const sitePanel = el.querySelector('#about-panel-site') as HTMLElement;
    expect(sitePanel.hasAttribute('hidden')).toBe(false);
    expect(el.textContent).toContain('Angular');
    expect(el.textContent).toContain('Docker');
    expect(el.querySelector('a[href="https://mcp.interchouette.net/"]')).toBeTruthy();
  });
});
