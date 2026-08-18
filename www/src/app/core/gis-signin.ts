import type { CustomerProfile } from './customer-session';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

interface TokenClient {
  requestAccessToken(override?: { prompt?: string }): void;
}

interface GisOauth {
  initTokenClient(opts: {
    client_id: string;
    scope: string;
    ux_mode?: 'popup' | 'redirect';
    callback: (res: { access_token?: string; error?: string }) => void;
  }): TokenClient;
}

function gisOauth(): GisOauth | undefined {
  const g = (globalThis as { google?: { accounts?: { oauth2?: GisOauth } } }).google;
  return g?.accounts?.oauth2;
}

/** Decode the GIS credential JWT (browser-only; not a server verification). */
export function profileFromGisJwt(credential: string): CustomerProfile | null {
  const part = credential.split('.')[1];
  if (!part) {
    return null;
  }
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = '='.repeat((4 - (padded.length % 4)) % 4);
    const json = JSON.parse(atob(padded + pad)) as Record<string, unknown>;
    return profileFromUserinfo(json);
  } catch {
    return null;
  }
}

export function profileFromUserinfo(json: Record<string, unknown>): CustomerProfile | null {
  if (
    typeof json['sub'] !== 'string' ||
    typeof json['email'] !== 'string' ||
    typeof json['name'] !== 'string' ||
    typeof json['picture'] !== 'string'
  ) {
    return null;
  }
  return {
    sub: json['sub'],
    email: json['email'],
    name: json['name'],
    picture: json['picture'],
  };
}

export function loadGisClient(): Promise<void> {
  if (gisOauth()) {
    return Promise.resolve();
  }
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Google Identity Services needs a browser'));
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      if (gisOauth()) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('GIS script failed')), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.referrerPolicy = 'no-referrer-when-downgrade';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('GIS script failed'));
    document.head.appendChild(script);
  });
}

async function profileFromAccessToken(accessToken: string): Promise<CustomerProfile | null> {
  try {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      return null;
    }
    return profileFromUserinfo((await res.json()) as Record<string, unknown>);
  } catch {
    return null;
  }
}

let tokenClient: TokenClient | null = null;

/** Initialize Google OAuth popup once. Returns false when GIS is unavailable. */
export async function initGisOneTap(
  clientId: string,
  onProfile: (profile: CustomerProfile) => void,
): Promise<boolean> {
  try {
    await loadGisClient();
  } catch {
    return false;
  }
  const oauth = gisOauth();
  if (!oauth) {
    return false;
  }
  tokenClient = oauth.initTokenClient({
    client_id: clientId,
    scope: 'openid email profile',
    ux_mode: 'popup',
    callback: (res) => {
      if (!res.access_token) {
        return;
      }
      void profileFromAccessToken(res.access_token).then((profile) => {
        if (profile) {
          onProfile(profile);
        }
      });
    },
  });
  return true;
}

/** "Client login" click: Google account picker popup (classic OAuth, not FedCM). */
export function openGisSignIn(): void {
  tokenClient?.requestAccessToken({ prompt: 'select_account' });
}
