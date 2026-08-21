import { inject } from '@angular/core';
import { Router } from '@angular/router';

import { BOOKING_SCHEDULE_URL, API_ORIGIN, apiBase } from './chat.constants';
import { SITE_ORIGIN } from './seo.constants';

/** Public pages agents may open (Angular paths, no leading slash except home). */
export const WEBMCP_PAGE_PATHS = ['', 'CV', 'about', 'privacy', 'terms', 'news'] as const;
export type WebMcpPagePath = (typeof WEBMCP_PAGE_PATHS)[number];

const EMPTY_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {},
  additionalProperties: false as const,
};

const OPEN_PAGE_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    path: {
      type: 'string' as const,
      description: 'Angular route path: empty string for home, or CV, about, privacy, terms, news.',
      enum: ['', 'CV', 'about', 'privacy', 'terms', 'news'] as const,
    },
  },
  required: ['path'] as const,
  additionalProperties: false as const,
};

export function isWebMcpPagePath(value: unknown): value is WebMcpPagePath {
  return typeof value === 'string' && (WEBMCP_PAGE_PATHS as readonly string[]).includes(value);
}

export function absolutePageUrl(path: WebMcpPagePath): string {
  return path === '' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}/${path}`;
}

export function siteOverviewText(): string {
  return [
    'Interchouette ITC - Gregory Roussac, Rust and Wasm freelance developer.',
    `Home: ${SITE_ORIGIN}/`,
    `CV: ${SITE_ORIGIN}/CV`,
    `CV PDF: ${SITE_ORIGIN}/CV/Gregory_Roussac.pdf`,
    `About: ${SITE_ORIGIN}/about`,
    `News: ${SITE_ORIGIN}/news`,
    `News RSS: ${API_ORIGIN}/v1/news/rss.xml`,
    `News Atom: ${API_ORIGIN}/v1/news/atom.xml`,
    `Privacy: ${SITE_ORIGIN}/privacy`,
    `Terms: ${SITE_ORIGIN}/terms`,
    'Contact email: contact@interchouette.net',
  ].join('\n');
}

export function contactText(): string {
  return [
    'Email: contact@interchouette.net',
    'GitHub org: https://github.com/Interchouette-ITC',
    'LinkedIn: https://www.linkedin.com/in/gregoryroussac/',
    'Signal: https://signal.me/#u/interchouette.42 (username interchouette.42)',
    'Twitter: https://twitter.com/interchouette',
    `Booking: ${BOOKING_SCHEDULE_URL}`,
  ].join('\n');
}

export function listPagesText(): string {
  const pages = WEBMCP_PAGE_PATHS.map(
    (path) => `- ${path === '' ? 'home' : path}: ${absolutePageUrl(path)}`,
  );
  pages.push(`- news RSS: ${API_ORIGIN}/v1/news/rss.xml`);
  pages.push(`- news Atom: ${API_ORIGIN}/v1/news/atom.xml`);
  return pages.join('\n');
}

/** Format API `/v1/news` JSON for agents (4h server cache). */
export function formatNewsSnapshotText(raw: unknown): string {
  const body = raw as {
    fetched_at?: string;
    cache_ttl_secs?: number;
    feeds?: {
      itc_linkedin?: { items?: { text?: string; url?: string; published_at?: string | null }[] };
      itc_x?: { items?: { text?: string; url?: string; published_at?: string | null }[] };
    };
  };
  const lines: string[] = [
    'Interchouette News (API cache, about every 4 hours)',
    `Page: ${SITE_ORIGIN}/news`,
    `JSON: ${API_ORIGIN}/v1/news`,
    `RSS: ${API_ORIGIN}/v1/news/rss.xml`,
    `Atom: ${API_ORIGIN}/v1/news/atom.xml`,
  ];
  if (body.fetched_at) {
    lines.push(`Fetched at: ${body.fetched_at}`);
  }
  if (body.cache_ttl_secs != null) {
    lines.push(`Cache TTL seconds: ${body.cache_ttl_secs}`);
  }
  lines.push('');
  const sections: [
    string,
    { items?: { text?: string; url?: string; published_at?: string | null }[] } | undefined,
  ][] = [
    ['Interchouette on X', body.feeds?.itc_x],
    ['Interchouette on LinkedIn', body.feeds?.itc_linkedin],
  ];
  for (const [label, feed] of sections) {
    lines.push(`## ${label}`);
    const items = feed?.items ?? [];
    if (items.length === 0) {
      lines.push('(no posts)');
      lines.push('');
      continue;
    }
    for (const item of items) {
      const when = item.published_at ? ` (${item.published_at})` : '';
      lines.push(`- ${item.text ?? ''}${when}`);
      if (item.url) {
        lines.push(`  ${item.url}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export async function fetchNewsSnapshotText(): Promise<string> {
  const res = await fetch(`${apiBase()}/v1/news?locale=en`);
  if (!res.ok) {
    throw new Error(`news API HTTP ${res.status}`);
  }
  return formatNewsSnapshotText(await res.json());
}

export function remoteMcpText(): string {
  return [
    'Official remote MCP (Streamable HTTP): https://mcp.interchouette.net/',
    'Transport: streamable-http',
    'Server card: https://interchouette.net/.well-known/mcp.json',
    'Site map: https://interchouette.net/llms.txt',
  ].join('\n');
}

/**
 * No-arg WebMCP tools (same empty input schema).
 * Angular `provideExperimentalWebMcpTools` requires one schema per provider call.
 */
export function createSiteInfoWebMcpTools() {
  return [
    {
      name: 'get_site_overview',
      description:
        'Returns a short overview of Interchouette ITC, Gregory Roussac, and the main public URLs.',
      inputSchema: EMPTY_INPUT_SCHEMA,
      execute: () => siteOverviewText(),
    },
    {
      name: 'get_contact',
      description: 'Returns public contact channels for Interchouette (email and social profiles).',
      inputSchema: EMPTY_INPUT_SCHEMA,
      execute: () => contactText(),
    },
    {
      name: 'list_public_pages',
      description: 'Lists public site pages with absolute URLs.',
      inputSchema: EMPTY_INPUT_SCHEMA,
      execute: () => listPagesText(),
    },
    {
      name: 'get_remote_mcp',
      description:
        'Returns the official remote Streamable HTTP MCP endpoint for Interchouette MCP (not this in-page WebMCP).',
      inputSchema: EMPTY_INPUT_SCHEMA,
      execute: () => remoteMcpText(),
    },
    {
      name: 'get_news',
      description:
        'Returns ITC LinkedIn and X posts from API GET /v1/news (JSON cached about every 4 hours).',
      inputSchema: EMPTY_INPUT_SCHEMA,
      execute: () => fetchNewsSnapshotText(),
    },
  ];
}

/** Navigation tool (path argument). Register with a separate provideExperimentalWebMcpTools call. */
export function createOpenPageWebMcpTools() {
  return [
    {
      name: 'open_public_page',
      description:
        'Navigates this browser tab to a public Interchouette page. Use path "" for home, or CV, about, privacy, terms, news.',
      inputSchema: OPEN_PAGE_INPUT_SCHEMA,
      execute: ({ path }: { path: string }) => {
        if (!isWebMcpPagePath(path)) {
          throw new Error(`Unsupported path: ${String(path)}`);
        }
        const router = inject(Router);
        void router.navigateByUrl(path === '' ? '/' : `/${path}`);
        return `Navigating to ${absolutePageUrl(path)}`;
      },
    },
  ];
}
