import { TestBed } from '@angular/core/testing';

import { CUSTOMER_SESSION_KEY, CustomerSession } from './customer-session';

describe('CustomerSession', () => {
  beforeEach(() => {
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });

  it('starts signed out and round-trips a profile', () => {
    const session = TestBed.inject(CustomerSession);
    expect(session.profile()).toBeNull();

    session.signIn({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      picture: 'https://example.com/ada.png',
      sub: 'sub-1',
    });
    expect(session.firstName()).toBe('Ada');
    expect(session.profile()?.email).toBe('ada@example.com');

    session.signOut();
    expect(session.profile()).toBeNull();
    expect(localStorage.getItem(CUSTOMER_SESSION_KEY)).toBeNull();
  });
});
