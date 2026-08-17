#!/usr/bin/env node
/**
 * Fail if packed prerender HTML throws browser console errors / pageerrors.
 * Catches hydration breaks (NG0507) that ng serve e2e cannot see.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from '@playwright/test';

const root = join(process.cwd(), 'dist', 'interchouette', 'browser');
const routes = ['/', '/CV', '/about', '/privacy', '/terms'];
const port = Number(process.env.STATIC_CONSOLE_PORT ?? 4201);
const host = '127.0.0.1';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
};

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveFile(rel) {
  const trimmed = rel.replace(/^\//, '');
  const direct = join(root, trimmed);
  try {
    const st = await stat(direct);
    if (st.isFile()) {
      return direct;
    }
    if (st.isDirectory()) {
      const indexPath = join(direct, 'index.html');
      if (await fileExists(indexPath)) {
        return indexPath;
      }
    }
  } catch {
    // fall through
  }
  const asIndex = join(root, trimmed, 'index.html');
  if (await fileExists(asIndex)) {
    return asIndex;
  }
  return null;
}

function startStaticServer(listenPort) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://${host}:${listenPort}`);
        let rel = decodeURIComponent(url.pathname);
        if (rel.endsWith('/')) {
          rel = `${rel}index.html`;
        }
        if (rel === '/') {
          rel = '/index.html';
        }
        const filePath = await resolveFile(rel);
        if (!filePath) {
          res.writeHead(404).end('not found');
          return;
        }
        const body = await readFile(filePath);
        res.writeHead(200, {
          'Content-Type': mime[extname(filePath)] ?? 'application/octet-stream',
        });
        res.end(body);
      } catch (err) {
        res.writeHead(500).end(String(err));
      }
    });
    server.once('error', reject);
    server.listen(listenPort, host, () => resolve(server));
  });
}

function isIgnorableConsoleError(text) {
  // Chat warm hits :8080 / chat host; CI and packed-dist gate have no chat process.
  return /net::ERR_CONNECTION_REFUSED/i.test(text);
}

async function collectErrors(page, base, path) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') {
      return;
    }
    const text = msg.text();
    if (isIgnorableConsoleError(text)) {
      return;
    }
    errors.push(`console.error: ${text}`);
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(750);
  return errors;
}

if (!(await fileExists(join(root, 'index.html')))) {
  console.error(`missing ${join(root, 'index.html')} — run npm run build first`);
  process.exit(1);
}

let server;
let listenPort = port;
for (let i = 0; i < 10; i += 1) {
  try {
    server = await startStaticServer(listenPort);
    break;
  } catch (err) {
    if (err && err.code === 'EADDRINUSE') {
      listenPort += 1;
      continue;
    }
    throw err;
  }
}
if (!server) {
  console.error('could not bind static console server');
  process.exit(1);
}

const base = `http://${host}:${listenPort}`;
let failed = false;
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : 'chrome',
  headless: true,
});

try {
  for (const path of routes) {
    const page = await browser.newPage();
    const errors = await collectErrors(page, base, path);
    await page.close();
    if (errors.length) {
      failed = true;
      console.error(`console gate failed for ${path}:`);
      for (const line of errors) {
        console.error(`  ${line}`);
      }
    } else {
      console.log(`console clean: ${path}`);
    }
  }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

if (failed) {
  process.exit(1);
}
console.log('static console gate ok');
