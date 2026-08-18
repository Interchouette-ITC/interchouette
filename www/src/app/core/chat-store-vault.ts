/**
 * Origin-bound AES-GCM envelope for chat resume data in this browser.
 *
 * The wrapping key is a non-extractable CryptoKey in IndexedDB for this origin.
 * That hides plaintext from a casual localStorage dump. Same-origin scripts
 * (and XSS) can still decrypt. The chat backend, Slack, and the language-model
 * path still see message text. This is not end-to-end encryption.
 */

export interface ChatStoreEnvelope {
  v: 1;
  iv: string;
  ciphertext: string;
}

const DB_NAME = 'ic-chat-store';
const DB_VERSION = 1;
const KEY_STORE = 'wrapping-key';
const WRAPPING_KEY_ID = 'chat-v1';

let wrappingKeyPromise: Promise<CryptoKey | null> | null = null;

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromB64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function canUseSubtle(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

/** True when `raw` is a v1 AES-GCM envelope JSON object. */
export function isChatStoreEnvelope(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as Partial<ChatStoreEnvelope>;
    return parsed.v === 1 && typeof parsed.iv === 'string' && typeof parsed.ciphertext === 'string';
  } catch {
    return false;
  }
}

/** Encrypts UTF-8 plaintext with AES-GCM. */
export async function encryptChatStorePlain(
  key: CryptoKey,
  plain: string,
): Promise<ChatStoreEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plain),
  );
  return { v: 1, iv: b64(iv), ciphertext: b64(ciphertext) };
}

/** Decrypts a v1 envelope to UTF-8 plaintext. */
export async function decryptChatStorePlain(
  key: CryptoKey,
  envelope: ChatStoreEnvelope,
): Promise<string> {
  const iv = fromB64(envelope.iv) as BufferSource;
  const data = fromB64(envelope.ciphertext) as BufferSource;
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plain);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) {
        db.createObjectStore(KEY_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Chat store open failed'));
  });
}

async function idbGetKey(): Promise<CryptoKey | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, 'readonly');
    const req = tx.objectStore(KEY_STORE).get(WRAPPING_KEY_ID);
    let result: CryptoKey | undefined;
    req.onsuccess = () => {
      result = req.result as CryptoKey | undefined;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Chat store get failed'));
    };
  });
}

async function idbPutKey(value: CryptoKey): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, 'readwrite');
    tx.objectStore(KEY_STORE).put(value, WRAPPING_KEY_ID);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Chat store put failed'));
    };
  });
}

async function loadOrCreateWrappingKey(): Promise<CryptoKey | null> {
  if (!canUseSubtle() || typeof indexedDB === 'undefined') {
    return null;
  }
  try {
    const existing = await idbGetKey();
    if (existing) {
      return existing;
    }
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    await idbPutKey(key);
    return key;
  } catch {
    return null;
  }
}

/** Origin-bound wrapping key, or null when Web Crypto / IndexedDB is unavailable. */
export function chatStoreWrappingKey(): Promise<CryptoKey | null> {
  if (!wrappingKeyPromise) {
    wrappingKeyPromise = loadOrCreateWrappingKey().catch(() => {
      wrappingKeyPromise = null;
      return null;
    });
  }
  return wrappingKeyPromise;
}

async function wrapPlaintext(plain: string): Promise<string | null> {
  const key = await chatStoreWrappingKey();
  if (!key) {
    return null;
  }
  const envelope = await encryptChatStorePlain(key, plain);
  return JSON.stringify(envelope);
}

async function unwrapEnvelope(raw: string): Promise<string | null> {
  const key = await chatStoreWrappingKey();
  if (!key) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ChatStoreEnvelope;
    return await decryptChatStorePlain(key, parsed);
  } catch {
    return null;
  }
}

function storageGet(key: string): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

function storageRemove(key: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

/**
 * Reads a localStorage value, decrypting a v1 envelope or migrating legacy plaintext.
 * Returns null when missing or when an envelope cannot be decrypted.
 */
export async function readOriginBoundValue(key: string): Promise<string | null> {
  const raw = storageGet(key)?.trim() ?? '';
  if (!raw || raw === 'undefined' || raw === 'null') {
    if (raw === 'undefined' || raw === 'null') {
      storageRemove(key);
    }
    return null;
  }
  if (isChatStoreEnvelope(raw)) {
    const plain = await unwrapEnvelope(raw);
    if (plain === null) {
      storageRemove(key);
    }
    return plain;
  }
  await writeOriginBoundValue(key, raw);
  return raw;
}

/** Encrypts `plain` and writes the envelope. No-ops if wrapping is unavailable (does not store plaintext). */
export async function writeOriginBoundValue(key: string, plain: string): Promise<void> {
  const envelope = await wrapPlaintext(plain);
  if (!envelope) {
    return;
  }
  storageSet(key, envelope);
}

export function removeOriginBoundValue(key: string): void {
  storageRemove(key);
}

/** Wipes chat resume + email keys in this browser. */
export function clearChatOriginBoundKeys(keys: readonly string[]): void {
  for (const key of keys) {
    storageRemove(key);
  }
}
