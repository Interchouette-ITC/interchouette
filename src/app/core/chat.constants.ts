import { environment } from '../../environments/environment';

/** Chat API base URL. Today co-located with knowledge MCP; will move to chat host. */
export function chatApiBase(): string {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8080';
  }
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://127.0.0.1:8080';
  }
  return 'https://mcp.interchouette.net';
}

export function chatWsUrl(sessionId: string): string {
  const base = chatApiBase().replace(/^http/, 'ws');
  return `${base}/v1/sessions/${sessionId}/ws`;
}

/**
 * Feature gate for the embeddable chat widget.
 * Source: `src/environments/environment*.ts` (dev vs production file replacement).
 * Optional test override: `window.__IC_CHAT_ENABLED__ = false` before bootstrap.
 */
export const CHAT_WIDGET_ENABLED = resolveChatWidgetEnabled();

export const CHAT_STORAGE_KEY = 'ic.chat.v1';

export const CONTACT_EMAIL = 'contact@interchouette.net';

function resolveChatWidgetEnabled(): boolean {
  if (typeof window !== 'undefined') {
    const runtime = (window as Window & { __IC_CHAT_ENABLED__?: unknown }).__IC_CHAT_ENABLED__;
    if (typeof runtime === 'boolean') {
      return runtime;
    }
    if (typeof runtime === 'string') {
      const v = runtime.trim().toLowerCase();
      if (['0', 'false', 'off', 'no'].includes(v)) {
        return false;
      }
      if (['1', 'true', 'on', 'yes'].includes(v)) {
        return true;
      }
    }
  }
  return environment.chatWidgetEnabled;
}
