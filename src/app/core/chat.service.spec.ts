import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ChatService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts closed with connecting defaults', () => {
    expect(service.open()).toBe(false);
    expect(service.mode()).toBe('connecting');
  });

  it('opens a session and applies away presence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          session_id: 'sess-1',
          short_code: 'S-00AB',
          mode: 'away',
          label: 'Away',
          hero: 'itcy',
        }),
      }),
    );

    class FakeSocket {
      readyState = 1;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      send = vi.fn();
      close = vi.fn();
    }
    vi.stubGlobal(
      'WebSocket',
      vi.fn().mockImplementation(() => new FakeSocket()),
    );

    await service.openPanel();
    expect(service.open()).toBe(true);
    expect(service.mode()).toBe('away');
    expect(service.hero()).toBe('itcy');
    expect(service.shortCode()).toBe('S-00AB');
  });
});
