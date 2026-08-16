import { Injectable, signal } from '@angular/core';

import { chatApiBase, chatWsUrl } from './chat.constants';

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

@Injectable({ providedIn: 'root' })
export class ChatService {
  readonly open = signal(false);
  readonly mode = signal<ChatMode>('connecting');
  readonly hero = signal<'greg' | 'itcy' | 'neutral'>('neutral');
  readonly statusLabel = signal('Connecting…');
  readonly messages = signal<ChatMessage[]>([]);
  readonly typing = signal(false);
  readonly shortCode = signal('');
  readonly error = signal<string | null>(null);
  readonly connecting = signal(false);
  readonly wsReady = signal(false);

  private socket: WebSocket | null = null;
  private sessionId: string | null = null;

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
    this.error.set(null);
    if (this.sessionId && this.socket?.readyState === WebSocket.OPEN) {
      this.wsReady.set(true);
      return;
    }
    await this.connect();
  }

  async connect(): Promise<void> {
    this.connecting.set(true);
    this.wsReady.set(false);
    this.mode.set('connecting');
    this.hero.set('neutral');
    this.statusLabel.set('Connecting…');
    this.error.set(null);
    this.messages.set([]);
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

  private applyPresence(mode: 'live' | 'away', label: string, hero: 'greg' | 'itcy'): void {
    this.mode.set(mode);
    this.hero.set(hero);
    this.statusLabel.set(label);
  }

  private bindSocket(sessionId: string): void {
    this.socket?.close();
    this.wsReady.set(false);
    const ws = new WebSocket(chatWsUrl(sessionId));
    this.socket = ws;
    ws.onopen = () => {
      this.wsReady.set(true);
      this.error.set(null);
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as Record<string, unknown>;
        this.onEvent(data);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onerror = () => {
      this.wsReady.set(false);
      this.error.set('Connection error');
    };
    ws.onclose = () => {
      this.wsReady.set(false);
      if (this.open() && !this.error()) {
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
        this.messages.update((list) => [
          ...list,
          {
            id: String(data['id'] ?? crypto.randomUUID()),
            role,
            text: String(data['text'] ?? ''),
          },
        ]);
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
}
