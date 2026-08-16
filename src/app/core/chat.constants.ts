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
 * Flip to false to ship the static site without chat (or for other hosts).
 * Later: drive from deploy config / chat host readiness.
 */
export const CHAT_WIDGET_ENABLED = true;

export const CHAT_STORAGE_KEY = 'ic.chat.v1';
