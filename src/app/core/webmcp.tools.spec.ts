import {
  absolutePageUrl,
  contactText,
  isWebMcpPagePath,
  listPagesText,
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
    expect(contactText()).toContain('GitHub org:');
    expect(listPagesText()).toContain('https://interchouette.net/privacy');
  });
});
