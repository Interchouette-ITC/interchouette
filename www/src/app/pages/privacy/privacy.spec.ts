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

  it('renders the privacy heading and home link', () => {
    const fixture = TestBed.createComponent(PrivacyPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent).toMatch(/privacy/i);
    expect(el.querySelector('a.back[routerlink="/"], a.back[href="/"]')).toBeTruthy();
  });
});
