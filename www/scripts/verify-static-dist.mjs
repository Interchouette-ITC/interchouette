#!/usr/bin/env node
/**
 * Assert production static publish layout after `npm run build`.
 * Fail CI if prerender / public assets expected by the host are missing,
 * or if HTML packing / hydration markers are wrong.
 */
import { access, constants, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(process.cwd(), 'dist', 'interchouette', 'browser');

const required = [
  'index.html',
  'CV/index.html',
  'privacy/index.html',
  'terms/index.html',
  'news/index.html',
  'account/index.html',
  'gis-signin/index.html',
  '_redirects',
  'sitemap.xml',
  'llms.txt',
  'news-snapshot.json',
  'rss.xml',
  'atom.xml',
  '.well-known/mcp.json',
  'fonts/fontawesome-subset.woff2',
  'workers/cold-start.js',
  'fonts/montserrat-latin-700.woff2',
  'fonts/montserrat-latin-400.woff2',
  'img/avatar-1x.webp',
  'img/avatar-244.webp',
  'img/avatar-340.webp',
  'img/avatar-2x.webp',
  'CV/Gregory_Roussac.pdf',
];

const htmlPages = [
  'index.html',
  'CV/index.html',
  'privacy/index.html',
  'terms/index.html',
  'news/index.html',
  'account/index.html',
  'gis-signin/index.html',
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

async function mustBePacked(rel) {
  const html = await readFile(join(root, rel), 'utf8');
  if (!html.includes('<!--nghm-->')) {
    console.error(`missing Angular hydration marker <!--nghm-->: ${rel}`);
    process.exitCode = 1;
  }
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  if (head && /\n\s{2,}</.test(head[1])) {
    console.error(`<head> still pretty-printed (run pack after build): ${rel}`);
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

const MCP_ENDPOINT = 'https://mcp.interchouette.net/';

async function mustBeXmlFeed(rel) {
  const raw = await readFile(join(root, rel), 'utf8');
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html')) {
    console.error(`${rel} looks like SPA HTML, not XML`);
    process.exitCode = 1;
    return;
  }
  if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<rss') && !trimmed.startsWith('<feed')) {
    console.error(`${rel} must start with XML (rss or atom)`);
    process.exitCode = 1;
  }
}

async function mustDiscoverMcp() {
  const card = JSON.parse(await readFile(join(root, '.well-known/mcp.json'), 'utf8'));
  if (card?.transport?.type !== 'streamable-http') {
    console.error('mcp.json transport.type must be streamable-http');
    process.exitCode = 1;
  }
  if (card?.transport?.endpoint !== MCP_ENDPOINT) {
    console.error(`mcp.json transport.endpoint must be ${MCP_ENDPOINT}`);
    process.exitCode = 1;
  }
  if (!card?.serverInfo?.name) {
    console.error('mcp.json missing serverInfo.name');
    process.exitCode = 1;
  }

  const llms = await readFile(join(root, 'llms.txt'), 'utf8');
  if (!llms.includes(MCP_ENDPOINT) || !llms.includes('streamable-http')) {
    console.error('llms.txt must advertise MCP endpoint and streamable-http');
    process.exitCode = 1;
  }
  if (!llms.includes('get_remote_mcp')) {
    console.error('llms.txt must mention WebMCP get_remote_mcp');
    process.exitCode = 1;
  }

  const index = await readFile(join(root, 'index.html'), 'utf8');
  if (!index.includes(`href="${MCP_ENDPOINT}"`) && !index.includes(`href='${MCP_ENDPOINT}'`)) {
    console.error('index.html must link rel=alternate to MCP endpoint');
    process.exitCode = 1;
  }
  if (!index.includes('/.well-known/mcp.json') || !index.includes('/llms.txt')) {
    console.error('index.html must describe llms.txt and /.well-known/mcp.json');
    process.exitCode = 1;
  }
}

await Promise.all(required.map(mustExist));
await Promise.all(htmlPages.map(mustBePacked));
await mustBeXmlFeed('rss.xml');
await mustBeXmlFeed('atom.xml');
await mustDiscoverMcp();
if (process.exitCode) {
  console.error(`static publish check failed under ${root}`);
  process.exit(process.exitCode);
}
console.log(`static publish ok (${required.length} paths + MCP discovery under ${root})`);
