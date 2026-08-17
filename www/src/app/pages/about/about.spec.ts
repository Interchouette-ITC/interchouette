import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AboutPage } from './about';

describe('AboutPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AboutPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the about heading, stack, and legal links', () => {
    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent).toMatch(/about/i);
    expect(el.textContent).toContain('Angular');
    expect(el.textContent).toContain('Rust');
    expect(el.textContent).toContain('Docker');
    expect(el.textContent).toContain('Cursor');
    expect(el.querySelector('a[href="https://mcp.interchouette.net/interchouette"]')).toBeTruthy();
    expect(el.querySelector('a[href="https://github.com/Interchouette-ITC"]')).toBeTruthy();
    expect(
      el.querySelector('a[href="https://www.linkedin.com/company/interchouette-itc"]'),
    ).toBeTruthy();
    expect(el.querySelector('a[routerlink="/privacy"], a[href="/privacy"]')).toBeTruthy();
    expect(el.querySelector('a[routerlink="/terms"], a[href="/terms"]')).toBeTruthy();
    expect(el.querySelector('a[routerlink="/"], a[href="/"]')).toBeTruthy();
  });
});
