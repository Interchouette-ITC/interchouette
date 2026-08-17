import { TestBed } from '@angular/core/testing';

import { COPY } from './i18n/catalog';
import { LocaleService } from './locale.service';

describe('LocaleService', () => {
  it('exposes English copy by default in unit tests', () => {
    TestBed.configureTestingModule({});
    const loc = TestBed.inject(LocaleService);

    expect(loc.locale).toBe('en');
    expect(loc.copy.headerNews).toBe(COPY.en.headerNews);
    expect(loc.copy.homePromise).toContain('Rust and Wasm');
  });
});
