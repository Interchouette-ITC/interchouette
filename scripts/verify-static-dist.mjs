#!/usr/bin/env node
/**
 * Assert production static publish layout after `npm run build`.
 * Fail CI if prerender / public assets expected by the host are missing.
 */
import { access, constants } from 'node:fs/promises';
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
  'img/avatar-360.webp',
  'img/avatar-2x.webp',
  'CV/Gregory_Roussac.pdf',
];

async function mustExist(rel) {
  const full = join(root, rel);
  try {
    await access(full, constants.R_OK);
  } catch {
    console.error(`missing publish file: ${rel}`);
    process.exitCode = 1;
  }
}

await Promise.all(required.map(mustExist));
if (process.exitCode) {
  console.error(`static publish check failed under ${root}`);
  process.exit(process.exitCode);
}
console.log(`static publish ok (${required.length} paths under ${root})`);
