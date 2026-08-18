import { describe, expect, it } from 'vitest';

import { chatApiBase, chatWsUrl } from './chat.constants';

describe('chat.constants', () => {
  it('uses localhost API on local hostnames', () => {
    expect(chatApiBase('127.0.0.1')).toBe('http://127.0.0.1:8080');
    expect(chatApiBase('localhost')).toBe('http://localhost:8080');
  });

  it('keeps chat on .net for every public TLD', () => {
    expect(chatApiBase('interchouette.net')).toBe('https://chat.interchouette.net');
    expect(chatApiBase('www.interchouette.net')).toBe('https://chat.interchouette.net');
    expect(chatApiBase('interchouette.nl')).toBe('https://chat.interchouette.net');
    expect(chatApiBase('www.interchouette.nl')).toBe('https://chat.interchouette.net');
    expect(chatApiBase('interchouette.fr')).toBe('https://chat.interchouette.net');
    expect(chatApiBase('www.interchouette.fr')).toBe('https://chat.interchouette.net');
  });

  it('builds a websocket session URL', () => {
    const url = chatWsUrl('abc');
    expect(url).toContain('/v1/sessions/abc/ws');
    expect(url.startsWith('ws')).toBe(true);
  });
});
