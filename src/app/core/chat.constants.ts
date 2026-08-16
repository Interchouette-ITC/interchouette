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
 * Feature gate for the embeddable chat widget. Default: enabled.
 *
 * Reliable switches (browser):
 * - `<meta name="ic-chat-widget" content="off">` in `index.html` (preferred deploy toggle)
 * - `window.__IC_CHAT_ENABLED__ = false` before app bootstrap (tests / emergency)
 *
 * Shell `CHAT_WIDGET_ENABLED` is only honored if the build injects it into the bundle
 * (`import.meta.env` / define). A bare export in `.env` does not reach the Angular client.
 */
export const CHAT_WIDGET_ENABLED = resolveChatWidgetEnabled();

export const CHAT_STORAGE_KEY = 'ic.chat.v1';

export const CONTACT_EMAIL = 'contact@interchouette.net';

function resolveChatWidgetEnabled(): boolean {
  if (typeof window !== 'undefined') {
    const runtime = (window as Window & { __IC_CHAT_ENABLED__?: unknown }).__IC_CHAT_ENABLED__;
    const fromRuntime = parseEnabledFlag(runtime);
    if (fromRuntime !== null) {
      return fromRuntime;
    }

    const meta = document.querySelector('meta[name="ic-chat-widget"]');
    const fromMeta = parseEnabledFlag(meta?.getAttribute('content'));
    if (fromMeta !== null) {
      return fromMeta;
    }
  }

  const fromEnv = parseEnabledFlag(readEnvChatFlag());
  if (fromEnv !== null) {
    return fromEnv;
  }

  return true;
}

function readEnvChatFlag(): unknown {
  try {
    const metaEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
    if (metaEnv && 'CHAT_WIDGET_ENABLED' in metaEnv) {
      return metaEnv['CHAT_WIDGET_ENABLED'];
    }
  } catch {
    /* no import.meta.env */
  }

  try {
    const proc = (globalThis as { process?: { env?: Record<string, string> } }).process;
    if (proc?.env && 'CHAT_WIDGET_ENABLED' in proc.env) {
      return proc.env['CHAT_WIDGET_ENABLED'];
    }
  } catch {
    /* no process */
  }

  return undefined;
}

/** `null` = flag absent (use default). */
function parseEnabledFlag(raw: unknown): boolean | null {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  if (typeof raw === 'boolean') {
    return raw;
  }
  const v = String(raw).trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(v)) {
    return false;
  }
  if (['1', 'true', 'on', 'yes'].includes(v)) {
    return true;
  }
  return null;
}
