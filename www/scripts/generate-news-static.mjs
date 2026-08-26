#!/usr/bin/env node
/**
 * Build-time news snapshot + apex RSS/Atom for interchouette.net.
 * Soft-fails when chat is unreachable so CI still produces a valid site.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const CHAT_BASE = process.env.CHAT_API_BASE?.replace(/\/$/, '') || 'https://api.interchouette.net';
const SITE = 'https://interchouette.net';
const RETRIES = 3;
const BACKOFF_MS = 1500;

const emptyFeed = (profileUrl) => ({
  items: [],
  profile_url: profileUrl,
  error: null,
});

const emptyResponse = () => ({
  fetched_at: new Date().toISOString(),
  cache_ttl_secs: 14400,
  feeds: {
    itc_linkedin: emptyFeed(
      'https://www.linkedin.com/company/interchouette-itc/posts/?feedView=all',
    ),
    itc_x: emptyFeed('https://x.com/interchouette'),
  },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function collectItems(response) {
  const feeds = [
    ['Interchouette on X', response.feeds.itc_x],
    ['Interchouette on LinkedIn', response.feeds.itc_linkedin],
  ];
  const items = [];
  for (const [source, feed] of feeds) {
    for (const item of feed.items ?? []) {
      items.push({
        id: item.id,
        title: `${source}: ${(item.text || '').slice(0, 80).replace(/\s+/g, ' ').trim() || item.id}`,
        text: item.text || '',
        url: item.url || SITE,
        published_at: item.published_at || null,
        source,
      });
    }
  }
  items.sort((a, b) => {
    const ta = a.published_at ? Date.parse(a.published_at) : 0;
    const tb = b.published_at ? Date.parse(b.published_at) : 0;
    return tb - ta;
  });
  return items;
}

function buildRss(response) {
  const items = collectItems(response);
  const lastBuild = xmlEscape(response.fetched_at || new Date().toISOString());
  const entries = items
    .map((item) => {
      const pub = item.published_at
        ? `\n      <pubDate>${xmlEscape(new Date(item.published_at).toUTCString())}</pubDate>`
        : '';
      return `    <item>
      <title>${xmlEscape(item.title)}</title>
      <link>${xmlEscape(item.url)}</link>
      <guid isPermaLink="false">${xmlEscape(item.id)}</guid>
      <description>${xmlEscape(item.text)}</description>${pub}
    </item>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Interchouette News</title>
    <link>${SITE}/news</link>
    <description>ITC LinkedIn and X posts from Interchouette</description>
    <language>en</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${entries}
  </channel>
</rss>
`;
}

function buildAtom(response) {
  const items = collectItems(response);
  const updated = xmlEscape(response.fetched_at || new Date().toISOString());
  const entries = items
    .map((item) => {
      const when = xmlEscape(item.published_at || response.fetched_at || new Date().toISOString());
      return `  <entry>
    <title>${xmlEscape(item.title)}</title>
    <link href="${xmlEscape(item.url)}" rel="alternate" type="text/html"/>
    <id>${xmlEscape(item.id)}</id>
    <updated>${when}</updated>
    <summary>${xmlEscape(item.text)}</summary>
  </entry>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Interchouette News</title>
  <link href="${SITE}/news" rel="alternate" type="text/html"/>
  <link href="${SITE}/atom.xml" rel="self" type="application/atom+xml"/>
  <id>${SITE}/news</id>
  <updated>${updated}</updated>
${entries}
</feed>
`;
}

async function wakeChat() {
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const res = await fetch(`${CHAT_BASE}/health`, { signal: AbortSignal.timeout(12_000) });
      if (res.ok) {
        return true;
      }
      console.warn(
        `generate-news-static: health HTTP ${res.status} (attempt ${attempt}/${RETRIES})`,
      );
    } catch (err) {
      console.warn(
        `generate-news-static: health failed (attempt ${attempt}/${RETRIES}): ${err.message}`,
      );
    }
    if (attempt < RETRIES) {
      await sleep(BACKOFF_MS * attempt);
    }
  }
  return false;
}

async function fetchNews() {
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const res = await fetch(`${CHAT_BASE}/v1/news?locale=en`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return /** @type {Awaited<ReturnType<typeof emptyResponse>>} */ (await res.json());
    } catch (err) {
      console.warn(
        `generate-news-static: /v1/news failed (attempt ${attempt}/${RETRIES}): ${err.message}`,
      );
      if (attempt < RETRIES) {
        await sleep(BACKOFF_MS * attempt);
      }
    }
  }
  return null;
}

async function main() {
  let response = emptyResponse();
  const awake = await wakeChat();
  if (!awake) {
    console.warn(
      'generate-news-static: chat unreachable after retries; writing empty snapshot and feeds',
    );
  } else {
    const live = await fetchNews();
    if (live?.feeds) {
      response = live;
      const n =
        (live.feeds.itc_x?.items?.length ?? 0) + (live.feeds.itc_linkedin?.items?.length ?? 0);
      console.log(`generate-news-static: fetched ${n} posts from ${CHAT_BASE}`);
    } else {
      console.warn('generate-news-static: no news payload; writing empty snapshot and feeds');
    }
  }

  await writeFile(join(PUBLIC, 'news-snapshot.json'), `${JSON.stringify(response, null, 2)}\n`);
  await writeFile(join(PUBLIC, 'rss.xml'), buildRss(response));
  await writeFile(join(PUBLIC, 'atom.xml'), buildAtom(response));
  console.log('generate-news-static: wrote news-snapshot.json, rss.xml, atom.xml');
}

await main();
