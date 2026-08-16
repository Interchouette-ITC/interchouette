import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatService, humanizeChatError } from './chat.service';

describe('humanizeChatError', () => {
  it('never returns Failed to fetch or undefined', () => {
    expect(humanizeChatError('Failed to fetch')).toBe(
      'Chat is temporarily unavailable. Please try again.',
    );
    expect(humanizeChatError(new TypeError('Failed to fetch'))).toBe(
      'Chat is temporarily unavailable. Please try again.',
    );
    expect(humanizeChatError('undefined')).toBe(
      'Chat is temporarily unavailable. Please try again.',
    );
    expect(humanizeChatError(undefined)).toBe(
      'Chat is temporarily unavailable. Please try again.',
    );
    expect(humanizeChatError(null)).toBe(
      'Chat is temporarily unavailable. Please try again.',
    );
    expect(humanizeChatError('')).toBe(
      'Chat is temporarily unavailable. Please try again.',
    );
  });

  it('keeps clear product messages', () => {
    expect(humanizeChatError('Session expired. Please try again.')).toBe(
      'Session expired. Please try again.',
    );
  });
});

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

  it('warm failure does not set a visitor-facing error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await service.warm();
    expect(service.error()).toBeNull();
    expect(service.wsReady()).toBe(false);
  });

  it('openPanel failure shows a friendly error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await service.openPanel();
    expect(service.open()).toBe(true);
    expect(service.error()).toBe('Chat is temporarily unavailable. Please try again.');
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
      vi.fn().mockImplementation(() => {
        const sock = new FakeSocket();
        queueMicrotask(() => {
          sock.onmessage?.(
            new MessageEvent('message', {
              data: JSON.stringify({
                type: 'ready',
                session_id: 'sess-1',
                short_code: 'S-00AB',
              }),
            }),
          );
        });
        return sock;
      }),
    );

    await service.openPanel();
    expect(service.open()).toBe(true);
    expect(service.mode()).toBe('away');
    expect(service.hero()).toBe('itcy');
    expect(service.shortCode()).toBe('S-00AB');
    expect(service.error()).toBeNull();
  });
});
