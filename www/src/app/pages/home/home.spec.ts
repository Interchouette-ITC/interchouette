import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HomePage } from './home';

describe('HomePage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders identity and primary contact links', () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.name')?.textContent).toContain('Gregory Roussac');
    expect(el.querySelector('a[routerlink="/CV"], a[href="/CV"]')).toBeTruthy();
    expect(el.querySelector('a[href="https://github.com/Interchouette-ITC"]')).toBeTruthy();
    expect(el.querySelector('a[href="mailto:contact@interchouette.net"]')).toBeTruthy();
    expect(el.querySelector('svg.fa-signal-messenger')).toBeTruthy();
  });
});
