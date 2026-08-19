import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TermsPage } from './terms';

describe('TermsPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TermsPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the terms heading, tabs, and home link', () => {
    const fixture = TestBed.createComponent(TermsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent).toMatch(/terms/i);
    expect(el.querySelector('[role="tablist"]')).toBeTruthy();
    expect(el.querySelectorAll('[role="tab"]').length).toBe(5);
    expect(el.querySelector('#terms-panel-intro')).toBeTruthy();
    expect(el.querySelector('app-page-brand-mark')).toBeTruthy();
    expect(el.querySelector('a.back[routerlink="/"], a.back[href="/"]')).toBeTruthy();
  });

  it('switches tab panels when a tab is clicked', () => {
    const fixture = TestBed.createComponent(TermsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const legalTab = el.querySelector('#terms-tab-legal') as HTMLButtonElement;
    legalTab.click();
    fixture.detectChanges();

    expect(el.querySelector('#terms-panel-legal')).toBeTruthy();
    expect(el.querySelector('#terms-panel-intro')).toBeFalsy();
    expect(legalTab.getAttribute('aria-selected')).toBe('true');
  });
});
