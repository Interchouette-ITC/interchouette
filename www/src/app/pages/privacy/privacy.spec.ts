import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PrivacyPage } from './privacy';

describe('PrivacyPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrivacyPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the privacy heading, tabs, and home link', () => {
    const fixture = TestBed.createComponent(PrivacyPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent).toMatch(/privacy/i);
    expect(el.querySelector('[role="tablist"]')).toBeTruthy();
    expect(el.querySelectorAll('[role="tab"]').length).toBe(5);
    expect(el.querySelectorAll('[role="tabpanel"]').length).toBe(5);
    expect(el.querySelector('#privacy-panel-intro')).toBeTruthy();
    expect(el.querySelector('#privacy-panel-data')?.hasAttribute('hidden')).toBe(true);
    expect(el.querySelector('app-page-brand-mark')).toBeTruthy();
    expect(el.querySelector('a.back[routerlink="/"], a.back[href="/"]')).toBeTruthy();
  });

  it('switches tab panels when a tab is clicked', () => {
    const fixture = TestBed.createComponent(PrivacyPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const dataTab = el.querySelector('#privacy-tab-data') as HTMLButtonElement;
    dataTab.click();
    fixture.detectChanges();

    expect(el.querySelector('#privacy-panel-data')?.hasAttribute('hidden')).toBe(false);
    expect(el.querySelector('#privacy-panel-intro')?.hasAttribute('hidden')).toBe(true);
    expect(dataTab.getAttribute('aria-selected')).toBe('true');
  });
});
