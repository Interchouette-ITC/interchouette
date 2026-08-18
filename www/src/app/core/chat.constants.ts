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
  return 'https://chat.interchouette.net';
}

export function chatWsUrl(sessionId: string): string {
  const base = chatApiBase().replace(/^http/, 'ws');
  return `${base}/v1/sessions/${sessionId}/ws`;
}

function envFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = raw.trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(value)) {
    return false;
  }
  if (['1', 'true', 'on', 'yes'].includes(value)) {
    return true;
  }
  return fallback;
}

/** From repo-root `.env` (`CHAT_WIDGET_ENABLED`). Restart `ng serve` after changes. */
export const CHAT_WIDGET_ENABLED = envFlag(import.meta.env.CHAT_WIDGET_ENABLED, true);

export const CHAT_STORAGE_KEY = 'ic.chat.v1';

/** Visitor email left in chat for follow-up (local only). */
export const CHAT_EMAIL_KEY = 'ic.chat.email';

/** Last email that was announced to Slack (dedupe across reloads). */
export const CHAT_EMAIL_ANNOUNCED_KEY = 'ic.chat.email.announced';

export const CONTACT_EMAIL = 'contact@interchouette.net';

/** Public Slack invite (home / about / chat intro). */
export const SLACK_JOIN_URL =
  'https://join.slack.com/t/interchouette/shared_invite/zt-2urug9dmr-PYzageTbj8bxD5c3n39QuA';

/** Public Google appointment page shown in chat. */
export const BOOKING_SCHEDULE_URL = 'https://calendar.app.google/tw9hhtJkmcssZQCY7';

/** Non-essential cookie / analytics consent choice. */
export const CONSENT_STORAGE_KEY = 'ic.consent.v1';
