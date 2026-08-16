#!/usr/bin/env node
/**
 * Minify prerendered HTML after `ng build` (Angular leaves pretty-printed markup).
 * Compacts application/ld+json and collapses HTML/CSS whitespace in publish HTML.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { minify } from 'html-minifier-terser';

const root = join(process.cwd(), 'dist', 'interchouette', 'browser');

async function* walkHtml(dir) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walkHtml(path);
    } else if (ent.name.endsWith('.html')) {
      yield path;
    }
  }
}

function compactJsonLd(html) {
  return html.replace(
    /(<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi,
    (match, open, body, close) => {
      try {
        return `${open}${JSON.stringify(JSON.parse(body))}${close}`;
      } catch {
        return match;
      }
    },
  );
}

let count = 0;
let before = 0;
let after = 0;

for await (const file of walkHtml(root)) {
  const raw = await readFile(file, 'utf8');
  before += Buffer.byteLength(raw);
  const minified = await minify(compactJsonLd(raw), {
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    decodeEntities: true,
    minifyCSS: true,
    minifyJS: false,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: false,
    removeStyleLinkTypeAttributes: true,
    sortAttributes: false,
    sortClassName: false,
  });
  after += Buffer.byteLength(minified);
  await writeFile(file, minified);
  count += 1;
}

if (!count) {
  console.error(`no HTML under ${root}`);
  process.exit(1);
}

const saved = before - after;
console.log(`minified ${count} HTML file(s): ${before} -> ${after} bytes (−${saved})`);
