#!/usr/bin/env node
/**
 * Pack prerendered HTML after `ng build` without breaking Angular hydration.
 * Compacts JSON-LD and minifies `<head>` only. Leaves `<body>` untouched
 * (hydration comment nodes and whitespace must stay intact — see NG0507).
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

async function packHeadOnly(html) {
  const match = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  if (!match) {
    return html;
  }
  const [full, inner] = match;
  const packedInner = await minify(inner, {
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
  return html.replace(full, full.replace(inner, packedInner));
}

let count = 0;
let before = 0;
let after = 0;

for await (const file of walkHtml(root)) {
  const raw = await readFile(file, 'utf8');
  before += Buffer.byteLength(raw);
  const hadHydration = raw.includes('<!--nghm-->');
  const packed = await packHeadOnly(compactJsonLd(raw));
  if (hadHydration && !packed.includes('<!--nghm-->')) {
    console.error(`hydration marker stripped by pack: ${file}`);
    process.exitCode = 1;
    continue;
  }
  after += Buffer.byteLength(packed);
  await writeFile(file, packed);
  count += 1;
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

if (!count) {
  console.error(`no HTML under ${root}`);
  process.exit(1);
}

const saved = before - after;
console.log(`packed ${count} HTML file(s): ${before} -> ${after} bytes (−${saved})`);
