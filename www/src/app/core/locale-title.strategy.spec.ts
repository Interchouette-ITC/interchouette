import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router, TitleStrategy } from '@angular/router';

import { routes } from '../app.routes';
import { LocaleTitleStrategy } from './locale-title.strategy';

describe('LocaleTitleStrategy', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: TitleStrategy, useClass: LocaleTitleStrategy }],
    });
  });

  it('uses English catalog titles for home', async () => {
    const router = TestBed.inject(Router);
    const title = TestBed.inject(Title);
    await router.navigateByUrl('/');
    expect(title.getTitle()).toContain('Freelance Developer');
  });
});
