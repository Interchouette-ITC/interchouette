#!/usr/bin/env node
/**
 * Emit extensionless-route siblings next to prerender folders.
 *
 * Render Static applies the SPA `/* → /index.html` rewrite when no file exists
 * at `/news` (directory indexes alone do not win). A sibling `news.html` is a
 * real resource, so `/news` serves prerendered HTML instead of the home shell.
 * Trailing-slash URLs keep using `news/index.html`.
 *
 * Archive weeks get the same sibling pattern plus explicit `_redirects` rules
 * because Render does not honor Netlify-style `/archive/:splat` splats.
 */
import { copyFile, access, constants, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(process.cwd(), 'dist', 'interchouette', 'browser');
const weekIdPattern = /^20\d{2}-W\d{2}$/;

const routes = ['about', 'news', 'archive', 'terms', 'privacy', 'account', 'gis-signin', 'CV'];

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

let weekIds = [];
try {
  weekIds = JSON.parse(await readFile(join(process.cwd(), 'public', 'archive-weeks.json'), 'utf8'));
  if (!Array.isArray(weekIds)) {
    weekIds = [];
  }
} catch {
  console.warn('publish-clean-routes: skip archive week siblings (no archive-weeks.json)');
}

for (const weekId of weekIds) {
  if (typeof weekId !== 'string' || !weekIdPattern.test(weekId)) {
    continue;
  }
  const src = join(root, 'archive', weekId, 'index.html');
  const dest = join(root, 'archive', `${weekId}.html`);
  try {
    await access(src, constants.R_OK);
  } catch {
    console.warn(`publish-clean-routes: skip missing archive/${weekId}/index.html`);
    continue;
  }
  await copyFile(src, dest);
  copied += 1;
}

const validWeekIds = weekIds.filter((id) => typeof id === 'string' && weekIdPattern.test(id));
if (validWeekIds.length > 0) {
  await injectArchiveRedirects(validWeekIds);
}

console.log(`publish-clean-routes: wrote ${copied} extensionless sibling(s)`);

async function injectArchiveRedirects(ids) {
  const redirectsPath = join(root, '_redirects');
  let rules;
  try {
    rules = await readFile(redirectsPath, 'utf8');
  } catch {
    console.warn('publish-clean-routes: skip redirect injection (no _redirects)');
    return;
  }

  rules = rules.replace(/^\/archive\/\*\s+\/archive\/:splat\/index\.html\s+200\s*$/m, '');
  rules = rules.replace(
    /\n# Archive week clean URLs \(generated at build\)[\s\S]*?(?=\n# (?:Feed aliases|SPA fallback))/,
    '\n',
  );

  const weekLines = ids.map((id) => `/archive/${id}  /archive/${id}.html  200`).join('\n');
  const block = `\n# Archive week clean URLs (generated at build)\n${weekLines}\n`;
  const spaFallback =
    '\n# SPA fallback: unknown paths → Angular shell (client ** → home)\n/*  /index.html  200';

  if (rules.includes(spaFallback)) {
    rules = rules.replace(spaFallback, `${block}${spaFallback}`);
  } else if (rules.includes('\n/*  /index.html  200')) {
    rules = rules.replace('\n/*  /index.html  200', `${block}\n/*  /index.html  200`);
  } else {
    rules += block;
  }

  await writeFile(redirectsPath, rules);
  console.log(`publish-clean-routes: injected ${ids.length} archive week redirect(s)`);
}
