import { RenderMode, ServerRoute } from '@angular/ssr';

/** Build-time prerender for static host (CDN). Runtime SSR for /news is a follow-up deploy. */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'news', renderMode: RenderMode.Prerender },
  { path: 'account', renderMode: RenderMode.Prerender },
  { path: 'gis-signin', renderMode: RenderMode.Prerender },
  { path: 'CV', renderMode: RenderMode.Prerender },
  { path: 'about', renderMode: RenderMode.Prerender },
  { path: 'privacy', renderMode: RenderMode.Prerender },
  { path: 'terms', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
