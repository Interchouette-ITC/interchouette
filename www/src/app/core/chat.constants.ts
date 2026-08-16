import { CHAT_WIDGET_ENABLED as CHAT_WIDGET_ENABLED_ENV } from './chat-widget.enabled';

/** Chat API base URL (chat backend; not the Interchouette MCP). */
export function chatApiBase(): string {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8080';
  }
  const host = window.location.hostname;
  // Same hostname as the page so Chromium does not treat localhost vs 127.0.0.1 as cross-site.
  if (host === 'localhost' || host === '127.0.0.1') {
    return `http://${host}:8080`;
  }
  return 'https://mcp.interchouette.net';
}

export function chatWsUrl(sessionId: string): string {
  const base = chatApiBase().replace(/^http/, 'ws');
  return `${base}/v1/sessions/${sessionId}/ws`;
}

/**
 * Feature gate for the embeddable chat widget.
 * Set `CHAT_WIDGET_ENABLED=false` in the repo `.env` (or the shell), then restart
 * `npm start` / re-run `npm run build` from `www/`. Synced by `scripts/sync-chat-env.mjs`.
 */
export const CHAT_WIDGET_ENABLED = CHAT_WIDGET_ENABLED_ENV;

export const CHAT_STORAGE_KEY = 'ic.chat.v1';

/** Visitor email left in chat for follow-up (local only). */
export const CHAT_EMAIL_KEY = 'ic.chat.email';

/** Last email that was announced to Slack (dedupe across reloads). */
export const CHAT_EMAIL_ANNOUNCED_KEY = 'ic.chat.email.announced';

export const CONTACT_EMAIL = 'contact@interchouette.net';

/** Public Slack invite (home / about / chat intro). */
export const SLACK_JOIN_URL =
  'https://join.slack.com/t/interchouette/shared_invite/zt-2urug9dmr-PYzageTbj8bxD5c3n39QuA';

/** Non-essential cookie / analytics consent choice. */
export const CONSENT_STORAGE_KEY = 'ic.consent.v1';
