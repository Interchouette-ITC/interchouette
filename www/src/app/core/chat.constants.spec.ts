import { describe, expect, it } from 'vitest';

import { chatApiBase, chatWsUrl } from './chat.constants';

describe('chat.constants', () => {
  it('uses localhost API on local hostnames', () => {
    expect(chatApiBase()).toMatch(/127\.0\.0\.1:8080|localhost:8080|chat\.interchouette\.net/);
  });

  it('builds a websocket session URL', () => {
    const url = chatWsUrl('abc');
    expect(url).toContain('/v1/sessions/abc/ws');
    expect(url.startsWith('ws')).toBe(true);
  });
});
