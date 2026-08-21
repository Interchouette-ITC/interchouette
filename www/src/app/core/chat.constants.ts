/** Interchouette HTTP API (chat, news, booking). Prod host: api.interchouette.net. */
export const API_ORIGIN = 'https://api.interchouette.net';

/** API base URL for the site (browser and SSR). */
export function apiBase(hostname?: string): string {
  const host = hostname ?? (typeof window === 'undefined' ? undefined : window.location.hostname);
  // Same hostname as the page so Chromium does not treat localhost vs 127.0.0.1 as cross-site.
  if (host === 'localhost' || host === '127.0.0.1') {
    return `http://${host}:8080`;
  }
  if (!host) {
    // Node SSR / build without a Host header: talk to the public API.
    return API_ORIGIN;
  }
  // Locale TLDs (.nl / .fr) share this Angular dist. API stays on .net.
  return API_ORIGIN;
}

/** @deprecated Use {@link apiBase}. */
export const chatApiBase = apiBase;

export function chatWsUrl(sessionId: string): string {
  const base = apiBase().replace(/^http/, 'ws');
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
export const CHAT_WIDGET_ENABLED = envFlag(import.meta.env?.CHAT_WIDGET_ENABLED, true);

export const CHAT_STORAGE_KEY = 'ic.chat.v1';

/** Visitor email left in chat for follow-up (local only). */
export const CHAT_EMAIL_KEY = 'ic.chat.email';

/** Last email that was announced to Slack (dedupe across reloads). */
export const CHAT_EMAIL_ANNOUNCED_KEY = 'ic.chat.email.announced';

/** Last N transcript lines kept in the origin-bound browser cache. */
export const CHAT_STORE_MAX_MESSAGES = 40;

/** localStorage keys wrapped with the origin-bound chat vault. */
export const CHAT_ORIGIN_BOUND_KEYS = [
  CHAT_STORAGE_KEY,
  CHAT_EMAIL_KEY,
  CHAT_EMAIL_ANNOUNCED_KEY,
] as const;

export const CONTACT_EMAIL = 'contact@interchouette.net';

/** Public Slack invite (home / about / chat intro). */
export const SLACK_JOIN_URL =
  'https://join.slack.com/t/interchouette/shared_invite/zt-2urug9dmr-PYzageTbj8bxD5c3n39QuA';

/** Public Google appointment page shown in chat. */
export const BOOKING_SCHEDULE_URL = 'https://calendar.app.google/tw9hhtJkmcssZQCY7';

/** Non-essential cookie / analytics consent choice. */
export const CONSENT_STORAGE_KEY = 'ic.consent.v1';
