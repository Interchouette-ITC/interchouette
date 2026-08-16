import { inject } from '@angular/core';
import { Router } from '@angular/router';

import { SITE_ORIGIN } from './seo.constants';

/** Public pages agents may open (Angular paths, no leading slash except home). */
export const WEBMCP_PAGE_PATHS = ['', 'CV', 'privacy', 'terms'] as const;
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
      description: 'Angular route path: empty string for home, or CV, privacy, terms.',
      enum: ['', 'CV', 'privacy', 'terms'] as const,
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
    'Telegram: https://t.me/Interchouette',
    'Twitter: https://twitter.com/interchouette',
  ].join('\n');
}

export function listPagesText(): string {
  return WEBMCP_PAGE_PATHS.map(
    (path) => `- ${path === '' ? 'home' : path}: ${absolutePageUrl(path)}`,
  ).join('\n');
}

export function remoteMcpText(): string {
  return [
    'Official remote MCP (Streamable HTTP): https://mcp.interchouette.net/interchouette',
    'Transport: streamable-http',
    'Discovery: https://interchouette.net/.well-known/mcp.json and https://interchouette.net/llms.txt',
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
        'Returns the official remote Streamable HTTP MCP endpoint for Interchouette knowledge (not this in-page WebMCP).',
      inputSchema: EMPTY_INPUT_SCHEMA,
      execute: () => remoteMcpText(),
    },
  ];
}

/** Navigation tool (path argument). Register with a separate provideExperimentalWebMcpTools call. */
export function createOpenPageWebMcpTools() {
  return [
    {
      name: 'open_public_page',
      description:
        'Navigates this browser tab to a public Interchouette page. Use path "" for home, or CV, privacy, terms.',
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
