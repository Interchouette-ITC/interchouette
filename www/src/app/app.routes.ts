import { Routes } from '@angular/router';

/**
 * URL convention (match live static hosting):
 * - `/`, `/privacy`, `/terms`, `/CV`: no trailing slash
 * - `/CV/` redirects to `/CV` on the host
 * - legacy `/CV - Gregory Roussac/` → `/CV`
 * Host must Rewrite clean paths to prerendered page HTML (never Redirect to root index).
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.HomePage),
    title: 'Gregory Roussac - Rust / Wasm Freelance Developer - Interchouette - ITC',
    data: {
      description:
        'Gregory Roussac, Rust and Wasm freelance developer (Interchouette ITC). Contact, CV, and links.',
      ogType: 'profile',
    },
  },
  {
    path: 'CV',
    loadComponent: () => import('./pages/cv/cv').then((m) => m.CvPage),
    title: 'Gregory Roussac - CV',
    data: {
      description:
        'Curriculum vitae of Gregory Roussac: Rust, Wasm, full-stack engineering experience and PDF download.',
      ogType: 'profile',
    },
  },
  {
    path: 'privacy',
    loadComponent: () => import('./pages/privacy/privacy').then((m) => m.PrivacyPage),
    title: 'Privacy Policy - Interchouette',
    data: {
      description: 'Privacy Policy for Interchouette services operated by Gregory Roussac.',
    },
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/terms/terms').then((m) => m.TermsPage),
    title: 'Terms of Service - Interchouette',
    data: {
      description: 'Terms of Service for Interchouette websites and applications.',
    },
  },
  {
    path: 'CV - Gregory Roussac',
    redirectTo: 'CV',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
