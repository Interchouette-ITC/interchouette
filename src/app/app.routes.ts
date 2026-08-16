import { Routes } from '@angular/router';

/**
 * URL convention (match live static hosting):
 * - `/`, `/privacy`, `/terms`: no trailing slash
 * - `/CV/`: trailing slash (directory); `/CV` redirects to `/CV/` on the host
 * - legacy `/CV - Gregory Roussac/` → `/CV/`
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.HomePage),
    title: 'Gregory Roussac - Rust / Wasm Freelance Developer - Interchouette - ITC',
  },
  {
    path: 'CV',
    loadComponent: () => import('./pages/cv/cv').then((m) => m.CvPage),
    title: 'Gregory Roussac - CV',
  },
  {
    path: 'privacy',
    loadComponent: () => import('./pages/privacy/privacy').then((m) => m.PrivacyPage),
    title: 'Privacy Policy - Interchouette',
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/terms/terms').then((m) => m.TermsPage),
    title: 'Terms of Service - Interchouette',
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
