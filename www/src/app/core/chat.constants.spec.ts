import { apiBase, chatWsUrl } from './chat.constants';

describe('apiBase', () => {
  it('uses local chat port on loopback hosts', () => {
    expect(apiBase('127.0.0.1')).toBe('http://127.0.0.1:8080');
    expect(apiBase('localhost')).toBe('http://localhost:8080');
  });

  it('uses api.interchouette.net on public site hosts', () => {
    expect(apiBase('interchouette.net')).toBe('https://api.interchouette.net');
    expect(apiBase('www.interchouette.net')).toBe('https://api.interchouette.net');
    expect(apiBase('interchouette.nl')).toBe('https://api.interchouette.net');
    expect(apiBase('www.interchouette.nl')).toBe('https://api.interchouette.net');
    expect(apiBase('interchouette.fr')).toBe('https://api.interchouette.net');
    expect(apiBase('www.interchouette.fr')).toBe('https://api.interchouette.net');
  });

  it('builds a matching websocket URL', () => {
    expect(chatWsUrl('abc')).toMatch(/\/v1\/sessions\/abc\/ws$/);
  });
});
