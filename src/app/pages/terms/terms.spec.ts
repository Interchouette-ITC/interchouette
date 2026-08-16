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

  it('renders the terms heading and home link', () => {
    const fixture = TestBed.createComponent(TermsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent).toMatch(/terms/i);
    expect(el.querySelector('a[routerlink="/"], a[href="/"]')).toBeTruthy();
  });
});
