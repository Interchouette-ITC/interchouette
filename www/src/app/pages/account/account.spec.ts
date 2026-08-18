import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { COPY } from '../../core/i18n/catalog';
import { AccountPage } from './account';

describe('AccountPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the stub and a sign-in button when signed out', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent?.trim()).toBe(COPY.en.accountTitle);
    expect(el.textContent).toContain(COPY.en.accountStub);
    expect(el.querySelector('button.account-signin')?.textContent?.trim()).toBe(
      COPY.en.accountSignIn,
    );
  });
});
