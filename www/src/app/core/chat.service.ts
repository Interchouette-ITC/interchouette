import { Injectable, computed, effect, signal } from '@angular/core';

import { CHAT_STORAGE_KEY, CHAT_WIDGET_ENABLED, chatApiBase, chatWsUrl } from './chat.constants';

const CHAT_OPENED_KEY = 'ic.chat.opened';

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
  /** Opaque resume code for Slack/support only; not shown in the visitor UI. */
  readonly shortCode = signal('');
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
      const resumed = await this.tryResumeSocket(stored.sessionId);
      if (resumed) {
        this.connecting.set(false);
        return;
      }
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
      this.bindSocket(body.session_id);
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
    if (!trimmed || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify({ type: 'email', email: trimmed }));
  }

  private async tryResumeSocket(sessionId: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.bindSocket(sessionId, {
        onReady: () => resolve(true),
        onFail: () => resolve(false),
      });
      window.setTimeout(() => {
        if (!this.wsReady()) {
          this.socket?.close();
          resolve(false);
        }
      }, 2500);
    });
  }

  private applyPresence(mode: 'live' | 'away', label: string, hero: 'greg' | 'itcy'): void {
    this.mode.set(mode);
    this.hero.set(hero);
    this.statusLabel.set(label);
  }

  private bindSocket(
    sessionId: string,
    hooks?: { onReady?: () => void; onFail?: () => void },
  ): void {
    this.socket?.close();
    this.wsReady.set(false);
    const ws = new WebSocket(chatWsUrl(sessionId));
    this.socket = ws;
    let settled = false;
    ws.onopen = () => {
      this.wsReady.set(true);
      this.error.set(null);
      if (!settled) {
        settled = true;
        hooks?.onReady?.();
      }
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as Record<string, unknown>;
        if (data['type'] === 'error') {
          if (!settled) {
            settled = true;
            hooks?.onFail?.();
          }
        }
        this.onEvent(data);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onerror = () => {
      this.wsReady.set(false);
      if (!settled) {
        settled = true;
        hooks?.onFail?.();
      } else {
        this.error.set('Connection error');
      }
    };
    ws.onclose = () => {
      this.wsReady.set(false);
      if (!settled) {
        settled = true;
        hooks?.onFail?.();
      } else if (this.open() && !this.error()) {
        this.statusLabel.set('Disconnected');
      }
    };
  }

  private onEvent(data: Record<string, unknown>): void {
    const type = String(data['type'] ?? '');
    switch (type) {
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
      case 'error':
        this.error.set(String(data['message'] ?? 'Error'));
        break;
      default:
        break;
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
      return parsed;
    } catch {
      return null;
    }
  }
}
