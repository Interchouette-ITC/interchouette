/** Chat API base URL (same Render service as knowledge MCP). */
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
