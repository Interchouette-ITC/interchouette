#!/usr/bin/env node
/**
 * Regenerate public/fonts/fontawesome-subset.woff2 from Font Awesome 4.7.
 * Requires: npm install --no-save subset-font font-awesome
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let subsetFont;
try {
  subsetFont = (await import('subset-font')).default;
} catch {
  console.error('Install subset-font first: npm install --no-save subset-font font-awesome');
  process.exit(1);
}

const unicodes = [
  0xf003, // envelope-o
  0xf099, // twitter
  0xf09b, // github
  0xf0e1, // linkedin
  0xf198, // slack
  0xf1c1, // file-pdf-o
  0xf1db, // circle-thin
  0xf232, // whatsapp
  0xf270, // amazon
  0xf2c6, // telegram
];

const faRoot = dirname(require.resolve('font-awesome/package.json'));
const ttfPath = join(faRoot, 'fonts/fontawesome-webfont.ttf');
const outPath = join(root, 'public/fonts/fontawesome-subset.woff2');

mkdirSync(dirname(outPath), { recursive: true });
const woff2 = await subsetFont(readFileSync(ttfPath), String.fromCodePoint(...unicodes), {
  targetFormat: 'woff2',
});
writeFileSync(outPath, woff2);
console.log(`wrote ${outPath} (${woff2.length} bytes)`);
