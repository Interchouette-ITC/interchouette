import {
  absolutePageUrl,
  contactText,
  isWebMcpPagePath,
  listPagesText,
  remoteMcpText,
  siteOverviewText,
} from './webmcp.tools';

describe('webmcp.tools helpers', () => {
  it('accepts only public page paths', () => {
    expect(isWebMcpPagePath('')).toBe(true);
    expect(isWebMcpPagePath('CV')).toBe(true);
    expect(isWebMcpPagePath('admin')).toBe(false);
  });

  it('builds absolute URLs', () => {
    expect(absolutePageUrl('')).toBe('https://interchouette.net/');
    expect(absolutePageUrl('CV')).toBe('https://interchouette.net/CV');
  });

  it('exposes overview, contact, and page list text', () => {
    expect(siteOverviewText()).toContain('contact@interchouette.net');
    expect(siteOverviewText()).not.toContain('mcp.interchouette.net');
    expect(contactText()).toContain('GitHub org:');
    expect(listPagesText()).toContain('https://interchouette.net/privacy');
  });

  it('exposes remote MCP discovery text', () => {
    expect(remoteMcpText()).toContain('https://mcp.interchouette.net/interchouette');
    expect(remoteMcpText()).toContain('streamable-http');
    expect(remoteMcpText()).toContain('https://interchouette.net/.well-known/mcp.json');
    expect(remoteMcpText()).toContain('https://interchouette.net/llms.txt');
  });
});
