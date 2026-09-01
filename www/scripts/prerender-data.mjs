#!/usr/bin/env node
/**
 * Build-time archive week list + sitemap for prerender and SEO.
 * Soft-fails when the API is unreachable.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const API_BASE = process.env.CHAT_API_BASE?.replace(/\/$/, '') || 'https://api.interchouette.net';
const SITE = 'https://interchouette.net';
const RETRIES = 3;
const BACKOFF_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchArchiveWeeks() {
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const res = await fetch(`${API_BASE}/v1/news/archive?locale=en`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = await res.json();
      const weeks = Array.isArray(body.weeks) ? body.weeks : [];
      return weeks
        .map((week) => week?.week_id)
        .filter((id) => typeof id === 'string' && /^20\d{2}-W\d{2}$/.test(id));
    } catch (err) {
      console.warn(
        `prerender-data: archive index failed (attempt ${attempt}/${RETRIES}): ${err.message}`,
      );
      if (attempt < RETRIES) {
        await sleep(BACKOFF_MS * attempt);
      }
    }
  }
  return [];
}

function buildSitemap(weekIds) {
  const staticPages = [
    { loc: `${SITE}/`, changefreq: 'monthly', priority: '1.0' },
    { loc: `${SITE}/CV`, changefreq: 'monthly', priority: '0.9' },
    { loc: `${SITE}/about`, changefreq: 'monthly', priority: '0.6' },
    { loc: `${SITE}/news`, changefreq: 'daily', priority: '0.8' },
    { loc: `${SITE}/archive`, changefreq: 'weekly', priority: '0.5' },
    { loc: `${API_BASE}/v1/news/rss.xml`, changefreq: 'daily', priority: '0.7' },
    { loc: `${API_BASE}/v1/news/atom.xml`, changefreq: 'daily', priority: '0.7' },
    { loc: `${SITE}/CV/Gregory_Roussac.pdf`, changefreq: 'monthly', priority: '0.7' },
    { loc: `${SITE}/privacy`, changefreq: 'yearly', priority: '0.4' },
    { loc: `${SITE}/terms`, changefreq: 'yearly', priority: '0.4' },
  ];
  const archivePages = weekIds.map((weekId) => ({
    loc: `${SITE}/archive/${weekId}/`,
    changefreq: 'monthly',
    priority: '0.45',
  }));
  const urls = [...staticPages, ...archivePages];
  const body = urls
    .map(
      (url) => `  <url>
    <loc>${url.loc}</loc>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

async function main() {
  const weekIds = await fetchArchiveWeeks();
  await writeFile(join(PUBLIC, 'archive-weeks.json'), `${JSON.stringify(weekIds, null, 2)}\n`);
  await writeFile(join(PUBLIC, 'sitemap.xml'), buildSitemap(weekIds));
  console.log(`prerender-data: ${weekIds.length} archive week(s), sitemap.xml updated`);
}

await main();
