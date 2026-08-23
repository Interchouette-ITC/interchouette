import {
  absolutePageUrl,
  contactText,
  formatNewsSnapshotText,
  isWebMcpPagePath,
  knowledgeTopicsText,
  listPagesText,
  remoteMcpText,
  siteOverviewText,
} from './webmcp.tools';

describe('webmcp.tools helpers', () => {
  it('accepts only public page paths', () => {
    expect(isWebMcpPagePath('')).toBe(true);
    expect(isWebMcpPagePath('CV')).toBe(true);
    expect(isWebMcpPagePath('about')).toBe(true);
    expect(isWebMcpPagePath('news')).toBe(true);
    expect(isWebMcpPagePath('admin')).toBe(false);
  });

  it('builds absolute URLs', () => {
    expect(absolutePageUrl('')).toBe('https://interchouette.net/');
    expect(absolutePageUrl('CV')).toBe('https://interchouette.net/CV');
    expect(absolutePageUrl('about')).toBe('https://interchouette.net/about');
  });

  it('exposes overview, contact, and page list text', () => {
    expect(siteOverviewText()).toContain('contact@interchouette.net');
    expect(siteOverviewText()).toContain('https://interchouette.net/about');
    expect(siteOverviewText()).toContain('https://api.interchouette.net/v1/news/rss.xml');
    expect(siteOverviewText()).toContain('https://api.interchouette.net/v1/news/atom.xml');
    expect(siteOverviewText()).not.toContain('mcp.interchouette.net');
    expect(contactText()).toContain('GitHub org:');
    expect(contactText()).toContain('calendar.app.google');
    expect(listPagesText()).toContain('https://interchouette.net/about');
    expect(listPagesText()).toContain('https://api.interchouette.net/v1/news/rss.xml');
  });

  it('formats news snapshot text for get_news', () => {
    const text = formatNewsSnapshotText({
      fetched_at: '2026-08-20T12:00:00.000Z',
      feeds: {
        itc_x: {
          items: [{ text: 'Hello X', url: 'https://x.com/a', published_at: '2026-08-19' }],
        },
        itc_linkedin: { items: [] },
      },
    });
    expect(text).toContain('Hello X');
    expect(text).toContain('https://api.interchouette.net/v1/news');
    expect(text).toContain('https://api.interchouette.net/v1/news/rss.xml');
  });

  it('exposes remote MCP discovery text', () => {
    expect(remoteMcpText()).toContain('https://mcp.interchouette.net/');
    expect(remoteMcpText()).toContain('streamable-http');
    expect(remoteMcpText()).toContain('https://interchouette.net/.well-known/mcp.json');
    expect(remoteMcpText()).toContain('https://interchouette.net/llms.txt');
    expect(remoteMcpText()).toContain('list_knowledge_index');
  });

  it('lists knowledge topics and points at remote MCP for bodies', () => {
    const text = knowledgeTopicsText();
    expect(text).toContain('itcy');
    expect(text).toContain('products-shipped');
    expect(text).toContain('get_remote_mcp');
    expect(text).toContain('get_doc_by_slug');
    expect(text).not.toContain('WORK-CONTRACT');
  });
});
