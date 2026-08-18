import { describe, expect, it } from 'vitest';

import {
  decryptChatStorePlain,
  encryptChatStorePlain,
  isChatStoreEnvelope,
} from './chat-store-vault';

describe('chat-store-vault crypto', () => {
  it('round-trips plaintext through AES-GCM', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const envelope = await encryptChatStorePlain(key, 'visitor@example.com');
    expect(envelope.v).toBe(1);
    expect(isChatStoreEnvelope(JSON.stringify(envelope))).toBe(true);
    await expect(decryptChatStorePlain(key, envelope)).resolves.toBe('visitor@example.com');
  });

  it('rejects a JSON blob that is not an envelope', () => {
    expect(isChatStoreEnvelope('{"sessionId":"abc","messages":[]}')).toBe(false);
    expect(isChatStoreEnvelope('plain@example.com')).toBe(false);
  });
});
