#!/usr/bin/env node
/**
 * Emit extensionless-route siblings next to prerender folders.
 *
 * Render Static applies the SPA `/* → /index.html` rewrite when no file exists
 * at `/news` (directory indexes alone do not win). A sibling `news.html` is a
 * real resource, so `/news` serves prerendered HTML instead of the home shell.
 * Trailing-slash URLs keep using `news/index.html`.
 */
import { copyFile, access, constants } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(process.cwd(), 'dist', 'interchouette', 'browser');

const routes = ['about', 'news', 'terms', 'privacy', 'account', 'gis-signin', 'CV'];

let copied = 0;
for (const route of routes) {
  const src = join(root, route, 'index.html');
  const dest = join(root, `${route}.html`);
  try {
    await access(src, constants.R_OK);
  } catch {
    console.warn(`publish-clean-routes: skip missing ${route}/index.html`);
    continue;
  }
  await copyFile(src, dest);
  copied += 1;
}

console.log(`publish-clean-routes: wrote ${copied} extensionless sibling(s)`);
