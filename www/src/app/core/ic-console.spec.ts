import { afterEach, describe, expect, it, vi } from 'vitest';

import { icConsoleWrite, icFormatKv, icFormatKvValue } from './ic-console';

describe('ic-console', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats key=value without dumping objects', () => {
    expect(icFormatKvValue('ok')).toBe('ok');
    expect(icFormatKvValue(new Error('boom'))).toBe('boom');
    expect(icFormatKv({ attempt: 2, err: 'timeout' })).toBe('attempt=2 err=timeout');
  });

  it('writes a colored error line', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    icConsoleWrite({
      ns: 'ic:chat',
      topic: 'socket',
      level: 'error',
      ms: 12.5,
      kv: { err: 'Connection error' },
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const args = spy.mock.calls[0] ?? [];
    expect(String(args[0])).toContain('[ic:chat]');
    expect(String(args[0])).toContain('socket');
    expect(String(args[0])).toContain('err=Connection error');
    expect(String(args[1])).toContain('#ff1744');
  });
});
