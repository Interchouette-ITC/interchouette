import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RenderMode, ServerRoute } from '@angular/ssr';

function archiveWeekIds(): string[] {
  try {
    const raw = readFileSync(join(process.cwd(), 'public', 'archive-weeks.json'), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (id): id is string => typeof id === 'string' && /^20\d{2}-W\d{2}$/.test(id),
    );
  } catch {
    return [];
  }
}

/** Build-time prerender for static host (CDN). Nightly deploy refreshes news/archive HTML. */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'news', renderMode: RenderMode.Prerender },
  { path: 'archive', renderMode: RenderMode.Prerender },
  {
    path: 'archive/:weekId',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return archiveWeekIds().map((weekId) => ({ weekId }));
    },
  },
  { path: 'account', renderMode: RenderMode.Prerender },
  { path: 'gis-signin', renderMode: RenderMode.Prerender },
  { path: 'CV', renderMode: RenderMode.Prerender },
  { path: 'about', renderMode: RenderMode.Prerender },
  { path: 'privacy', renderMode: RenderMode.Prerender },
  { path: 'terms', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
