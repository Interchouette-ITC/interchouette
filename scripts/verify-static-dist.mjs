#!/usr/bin/env node
/**
 * Assert production static publish layout after `npm run build`.
 * Fail CI if prerender / public assets expected by the host are missing,
 * or if HTML was left pretty-printed (minify-static-html must have run).
 */
import { access, constants, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(process.cwd(), 'dist', 'interchouette', 'browser');

const required = [
  'index.html',
  'CV/index.html',
  'privacy/index.html',
  'terms/index.html',
  '_redirects',
  'sitemap.xml',
  'llms.txt',
  'fonts/fontawesome-subset.woff2',
  'fonts/montserrat-latin-700.woff2',
  'fonts/montserrat-latin-400.woff2',
  'img/avatar-1x.webp',
  'img/avatar-244.webp',
  'img/avatar-340.webp',
  'img/avatar-2x.webp',
  'CV/Gregory_Roussac.pdf',
];

const htmlPages = ['index.html', 'CV/index.html', 'privacy/index.html', 'terms/index.html'];

async function mustExist(rel) {
  const full = join(root, rel);
  try {
    await access(full, constants.R_OK);
  } catch {
    console.error(`missing publish file: ${rel}`);
    process.exitCode = 1;
  }
}

async function mustBeMinified(rel) {
  const html = await readFile(join(root, rel), 'utf8');
  if (/\n\s{2,}</.test(html)) {
    console.error(`HTML still pretty-printed (run minify after build): ${rel}`);
    process.exitCode = 1;
  }
  const ld = html.match(
    /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (ld && /\n/.test(ld[1])) {
    console.error(`JSON-LD still pretty-printed: ${rel}`);
    process.exitCode = 1;
  }
}

await Promise.all(required.map(mustExist));
await Promise.all(htmlPages.map(mustBeMinified));
if (process.exitCode) {
  console.error(`static publish check failed under ${root}`);
  process.exit(process.exitCode);
}
console.log(`static publish ok (${required.length} paths under ${root})`);
