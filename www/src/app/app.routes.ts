import { Routes } from '@angular/router';

/**
 * URL convention (match live static hosting):
 * - `/`, `/about`, `/privacy`, `/terms`, `/CV`: no trailing slash
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
      titleKey: 'titleHome',
      descriptionKey: 'descHome',
    },
  },
  {
    path: 'news',
    loadComponent: () => import('./pages/news/news').then((m) => m.NewsPage),
    title: 'News - Interchouette',
    data: {
      description: 'News from Interchouette ITC.',
      titleKey: 'titleNews',
      descriptionKey: 'descNews',
    },
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
    title: 'Client login - Interchouette',
    data: {
      description: 'Sign in to Interchouette with Google. The session stays in this browser.',
      titleKey: 'titleLogin',
      descriptionKey: 'descLogin',
      robots: 'noindex, follow',
    },
  },
  {
    path: 'account',
    loadComponent: () => import('./pages/account/account').then((m) => m.AccountPage),
    title: 'Account - Interchouette',
    data: {
      description: 'Customer space for Interchouette.',
      titleKey: 'titleAccount',
      descriptionKey: 'descAccount',
      robots: 'noindex, follow',
    },
  },
  {
    path: 'gis-signin',
    loadComponent: () => import('./pages/gis-signin/gis-signin').then((m) => m.GisSigninPage),
    title: 'Client login - Interchouette',
    data: {
      description: 'Google sign-in callback for Interchouette.',
      titleKey: 'titleLogin',
      descriptionKey: 'descLogin',
      robots: 'noindex, follow',
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
      titleKey: 'titleCv',
      descriptionKey: 'descCv',
    },
  },
  {
    path: 'about',
    loadComponent: () => import('./pages/about/about').then((m) => m.AboutPage),
    title: 'About Interchouette - ITC',
    data: {
      description:
        'Interchouette - ITC: how interchouette.net is built (Angular, Rust, Docker, Cursor) and public links.',
      titleKey: 'titleAbout',
      descriptionKey: 'descAbout',
    },
  },
  {
    path: 'privacy',
    loadComponent: () => import('./pages/privacy/privacy').then((m) => m.PrivacyPage),
    title: 'Privacy Policy - Interchouette',
    data: {
      description: 'Privacy Policy for Interchouette services operated by Gregory Roussac.',
      titleKey: 'titlePrivacy',
      descriptionKey: 'descPrivacy',
    },
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/terms/terms').then((m) => m.TermsPage),
    title: 'Terms of Service - Interchouette',
    data: {
      description: 'Terms of Service for Interchouette websites and applications.',
      titleKey: 'titleTerms',
      descriptionKey: 'descTerms',
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
