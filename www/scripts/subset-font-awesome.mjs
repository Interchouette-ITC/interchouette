#!/usr/bin/env node
/**
 * Regenerate the Font Awesome subset used on the home page:
 * public/fonts/fontawesome-subset.woff2 (FA 4.7 glyphs).
 *
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
  console.error('Install deps first: npm install --no-save subset-font font-awesome');
  process.exit(1);
}

const fa4Unicodes = [
  0xf003, // envelope-o
  0xf086, // comments
  0xf099, // twitter
  0xf09b, // github
  0xf0e1, // linkedin
  0xf198, // slack
  0xf1c1, // file-pdf-o
  0xf1db, // circle-thin
  0xf232, // whatsapp
  0xf270, // amazon
];

const fontsDir = join(root, 'public/fonts');
mkdirSync(fontsDir, { recursive: true });

const faRoot = dirname(require.resolve('font-awesome/package.json'));
const fa4Ttf = join(faRoot, 'fonts/fontawesome-webfont.ttf');
const fa4Out = join(fontsDir, 'fontawesome-subset.woff2');
const fa4Woff2 = await subsetFont(readFileSync(fa4Ttf), String.fromCodePoint(...fa4Unicodes), {
  targetFormat: 'woff2',
});
writeFileSync(fa4Out, fa4Woff2);
console.log(`wrote ${fa4Out} (${fa4Woff2.length} bytes)`);
