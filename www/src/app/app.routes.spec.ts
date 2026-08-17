import { routes } from './app.routes';

describe('routes', () => {
  it('exposes the public page paths with titles', () => {
    const byPath = Object.fromEntries(
      routes.filter((r) => typeof r.path === 'string' && r.loadComponent).map((r) => [r.path, r]),
    );

    expect(byPath['']?.title).toContain('Gregory Roussac');
    expect(byPath['CV']?.title).toBe('Gregory Roussac - CV');
    expect(byPath['about']?.title).toContain('About');
    expect(byPath['news']?.title).toContain('News');
    expect(byPath['login']?.title).toContain('Client login');
    expect(byPath['account']?.title).toContain('Account');
    expect(byPath['privacy']?.title).toContain('Privacy');
    expect(byPath['terms']?.title).toContain('Terms');
  });

  it('redirects the legacy CV path and unknown paths', () => {
    const legacy = routes.find((r) => r.path === 'CV - Gregory Roussac');
    const catchAll = routes.find((r) => r.path === '**');

    expect(legacy?.redirectTo).toBe('CV');
    expect(legacy?.pathMatch).toBe('full');
    expect(catchAll?.redirectTo).toBe('');
  });
});
