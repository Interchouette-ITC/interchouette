import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { COPY } from '../../core/i18n/catalog';
import { LoginPage } from './login';

describe('LoginPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('shows a Google button and explains login is not configured', () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector('button.google-btn') as HTMLButtonElement | null;

    expect(el.querySelector('h1')?.textContent?.trim()).toBe(COPY.en.loginTitle);
    expect(btn?.textContent?.trim()).toBe(COPY.en.loginGoogle);
    expect(btn?.disabled).toBe(true);
    expect(el.textContent).toContain(COPY.en.loginNotConfigured);
  });
});
