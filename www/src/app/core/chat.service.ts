import { Injectable, computed, effect, signal } from '@angular/core';

import {
  CHAT_EMAIL_ANNOUNCED_KEY,
  CHAT_EMAIL_KEY,
  CHAT_STORAGE_KEY,
  CHAT_WIDGET_ENABLED,
  chatApiBase,
  chatWsUrl,
} from './chat.constants';

const CHAT_OPENED_KEY = 'ic.chat.opened';

/** Old live ack that leaked Slack routing; rewrite if still in localStorage. */
const LEGACY_SLACK_ACK =
  'Message delivered to Greg. Reply in this chat when he answers in the Slack thread.';
const LIVE_DELIVERY_ACK = 'Message sent. Greg will reply here, usually within minutes.';

export type ChatMode = 'live' | 'away' | 'connecting';
export type ChatRole = 'visitor' | 'greg' | 'itcy' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

interface SessionResponse {
  session_id: string;
  short_code: string;
  mode: 'live' | 'away';
  label: string;
  hero: 'greg' | 'itcy';
}

interface StoredChat {
  sessionId: string;
  resumeCode: string;
  messages: ChatMessage[];
  mode: 'live' | 'away';
  hero: 'greg' | 'itcy';
  label: string;
  savedAt: number;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  readonly open = signal(false);
  readonly mode = signal<ChatMode>('connecting');
  readonly hero = signal<'greg' | 'itcy' | 'neutral'>('neutral');
  readonly statusLabel = signal('Connecting…');
  readonly messages = signal<ChatMessage[]>([]);
  readonly typing = signal(false);
  /** Opaque resume / ticket code for the visitor (and Slack). */
  readonly shortCode = signal('');
  /** True when localStorage already has a prior chat transcript. */
  readonly priorConversation = computed(() =>
    this.messages().some(
      (m) => m.role === 'visitor' || m.role === 'greg' || m.role === 'itcy' || m.role === 'system',
    ),
  );
  readonly error = signal<string | null>(null);
  readonly connecting = signal(false);
  readonly wsReady = signal(false);
  /** True once the session socket is up (live or away). False while disabled, warming, or failed. */
  readonly ready = computed(
    () =>
      CHAT_WIDGET_ENABLED && this.wsReady() && (this.mode() === 'live' || this.mode() === 'away'),
  );

  private socket: WebSocket | null = null;
  private sessionId: string | null = null;
  private warming = false;
  /** Last email posted on this socket session (dedupe Save spam). */
  private lastPostedEmail = '';

  constructor() {
    effect(() => {
      const messages = this.messages();
      const sessionId = this.sessionId;
      const resumeCode = this.shortCode();
      const mode = this.mode();
      const hero = this.hero();
      if (!sessionId || !resumeCode || mode === 'connecting' || hero === 'neutral') {
        return;
      }
      this.persist({
        sessionId,
        resumeCode,
        messages,
        mode,
        hero,
        label: this.statusLabel(),
        savedAt: Date.now(),
      });
    });
  }

  /** Background connect without opening the panel (contact bar / FAB readiness). */
  async warm(): Promise<void> {
    if (!CHAT_WIDGET_ENABLED || this.warming) {
      return;
    }
    if (this.ready()) {
      return;
    }
    this.warming = true;
    try {
      await this.connect();
    } finally {
      this.warming = false;
    }
  }

  toggle(): void {
    if (this.open()) {
      this.closePanel();
      return;
    }
    void this.openPanel();
  }

  closePanel(): void {
    this.open.set(false);
  }

  async openPanel(): Promise<void> {
    this.open.set(true);
    this.markOpened();
    this.error.set(null);
    if (this.sessionId && this.socket?.readyState === WebSocket.OPEN) {
      this.wsReady.set(true);
      return;
    }
    await this.connect();
  }

  /** True after the visitor opened the chat panel at least once this browser session. */
  hasOpenedThisSession(): boolean {
    if (typeof sessionStorage === 'undefined') {
      return false;
    }
    try {
      return sessionStorage.getItem(CHAT_OPENED_KEY) === '1';
    } catch {
      return false;
    }
  }

  private markOpened(): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }
    try {
      sessionStorage.setItem(CHAT_OPENED_KEY, '1');
    } catch {
      /* private mode */
    }
  }

  async connect(): Promise<void> {
    this.connecting.set(true);
    this.wsReady.set(false);
    this.error.set(null);

    const stored = this.readStore();
    if (stored?.sessionId) {
      this.sessionId = stored.sessionId;
      this.shortCode.set(stored.resumeCode);
      this.messages.set(stored.messages);
      this.applyPresence(stored.mode, stored.label, stored.hero);
      const resumed = await this.bindSocket(stored.sessionId);
      if (resumed) {
        this.connecting.set(false);
        return;
      }
      // Stale id after chat restart: drop it and mint a fresh session (keep transcript).
      this.clearStore();
      this.error.set(null);
    }

    this.mode.set('connecting');
    this.hero.set('neutral');
    this.statusLabel.set('Connecting…');
    if (!stored?.messages.length) {
      this.messages.set([]);
    }

    try {
      const res = await fetch(`${chatApiBase()}/v1/sessions`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(`Session failed (${res.status})`);
      }
      const body = (await res.json()) as SessionResponse;
      this.sessionId = body.session_id;
      this.shortCode.set(body.short_code);
      this.applyPresence(body.mode, body.label, body.hero);
      const linked = await this.bindSocket(body.session_id);
      if (!linked) {
        throw new Error('Could not open chat socket');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not connect';
      this.error.set(message);
      this.mode.set('away');
      this.hero.set('itcy');
      this.statusLabel.set('Offline');
      this.wsReady.set(false);
    } finally {
      this.connecting.set(false);
    }
  }

  send(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify({ type: 'message', text: trimmed }));
  }

  sendEmail(email: string): void {
    const trimmed = email.trim();
    if (!trimmed) {
      return;
    }
    // Always keep a local copy (localStorage, not cookies). Notify only when the socket is up.
    this.persistEmail(trimmed);
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    if (this.lastPostedEmail.toLowerCase() === trimmed.toLowerCase()) {
      return;
    }
    this.lastPostedEmail = trimmed;
    const announced = this.readAnnouncedEmail();
    const shouldAnnounce = announced.toLowerCase() !== trimmed.toLowerCase();
    if (shouldAnnounce) {
      this.persistAnnouncedEmail(trimmed);
    }
    this.socket.send(JSON.stringify({ type: 'email', email: trimmed, announce: shouldAnnounce }));
  }

  /** Last email the visitor saved in chat (browser localStorage). */
  readSavedEmail(): string {
    return this.readStorageKey(CHAT_EMAIL_KEY);
  }

  private readAnnouncedEmail(): string {
    return this.readStorageKey(CHAT_EMAIL_ANNOUNCED_KEY);
  }

  private readStorageKey(key: string): string {
    if (typeof localStorage === 'undefined') {
      return '';
    }
    try {
      const raw = localStorage.getItem(key)?.trim() ?? '';
      if (!raw || raw === 'undefined' || raw === 'null') {
        if (raw === 'undefined' || raw === 'null') {
          localStorage.removeItem(key);
        }
        return '';
      }
      return raw;
    } catch {
      return '';
    }
  }

  private persistEmail(email: string): void {
    this.writeStorageKey(CHAT_EMAIL_KEY, email);
  }

  private persistAnnouncedEmail(email: string): void {
    this.writeStorageKey(CHAT_EMAIL_ANNOUNCED_KEY, email);
  }

  private writeStorageKey(key: string, value: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch {
      /* quota / private mode */
    }
  }

  private applyPresence(mode: 'live' | 'away', label: string, hero: 'greg' | 'itcy'): void {
    this.mode.set(mode);
    this.hero.set(hero);
    this.statusLabel.set(label);
  }

  /** Open WS and resolve only after the server `ready` event (not merely TCP open). */
  private bindSocket(sessionId: string): Promise<boolean> {
    this.socket?.close();
    this.wsReady.set(false);
    this.lastPostedEmail = '';
    const ws = new WebSocket(chatWsUrl(sessionId));
    this.socket = ws;
    let settled = false;

    return new Promise((resolve) => {
      const succeed = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        this.wsReady.set(true);
        this.error.set(null);
        resolve(true);
      };

      const fail = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        this.wsReady.set(false);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        resolve(false);
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as Record<string, unknown>;
          const type = String(data['type'] ?? '');
          if (type === 'ready') {
            if (typeof data['session_id'] === 'string' && data['session_id']) {
              this.sessionId = data['session_id'];
            }
            if (typeof data['short_code'] === 'string' && data['short_code']) {
              this.shortCode.set(data['short_code']);
            }
            succeed();
          }
          if (type === 'error') {
            const message = String(data['message'] ?? 'Error');
            // Dead resume id after chat process restart — soft-fail, mint a new session.
            if (/unknown session/i.test(message)) {
              fail();
              return;
            }
            if (!settled) {
              this.error.set(message);
              fail();
              return;
            }
          }
          this.onEvent(data);
        } catch {
          /* ignore malformed */
        }
      };
      ws.onerror = () => {
        if (!settled) {
          fail();
        } else {
          this.error.set('Connection error');
        }
      };
      ws.onclose = () => {
        this.wsReady.set(false);
        if (!settled) {
          fail();
        } else if (this.open() && !this.error()) {
          this.statusLabel.set('Disconnected');
        }
      };
      window.setTimeout(() => {
        if (!settled) {
          fail();
        }
      }, 2500);
    });
  }

  private onEvent(data: Record<string, unknown>): void {
    const type = String(data['type'] ?? '');
    switch (type) {
      case 'ready':
        break;
      case 'presence':
        this.applyPresence(
          data['mode'] === 'live' ? 'live' : 'away',
          String(data['label'] ?? ''),
          data['mode'] === 'live' ? 'greg' : 'itcy',
        );
        break;
      case 'message': {
        const role = String(data['role'] ?? 'system') as ChatRole;
        const id = String(data['id'] ?? crypto.randomUUID());
        const text = String(data['text'] ?? '');
        this.messages.update((list) => {
          if (list.some((m) => m.id === id)) {
            return list;
          }
          return [...list, { id, role, text }];
        });
        break;
      }
      case 'typing':
        this.typing.set(Boolean(data['active']));
        break;
      case 'error': {
        const message = String(data['message'] ?? 'Error');
        if (/unknown session/i.test(message)) {
          break;
        }
        this.error.set(message);
        break;
      }
      default:
        break;
    }
  }

  private clearStore(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      /* private mode */
    }
  }

  private persist(payload: StoredChat): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* quota / private mode */
    }
  }

  private readStore(): StoredChat | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as StoredChat;
      if (!parsed.sessionId || !Array.isArray(parsed.messages)) {
        return null;
      }
      // Drop stale transcripts after 7 days.
      if (Date.now() - (parsed.savedAt || 0) > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(CHAT_STORAGE_KEY);
        return null;
      }
      parsed.messages = sanitizeStoredMessages(parsed.messages);
      return parsed;
    } catch {
      return null;
    }
  }
}

function sanitizeStoredMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((msg) => {
    if (
      msg.text === LEGACY_SLACK_ACK ||
      /slack thread/i.test(msg.text) ||
      /will reply in this chat when he can/i.test(msg.text) ||
      /usually within a few minutes/i.test(msg.text)
    ) {
      return { ...msg, text: LIVE_DELIVERY_ACK };
    }
    return msg;
  });
}
