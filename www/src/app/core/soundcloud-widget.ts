/** Minimal SoundCloud Widget API surface used by the radio player. */
export type SoundCloudSound = {
  title?: string;
  user?: { username?: string };
  permalink_url?: string;
};

export type SoundCloudWidget = {
  bind: (event: string, listener: (...args: unknown[]) => void) => void;
  unbind: (event: string) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  skip: (soundIndex: number) => void;
  setVolume: (volume: number) => void;
  getSounds: (callback: (sounds: SoundCloudSound[]) => void) => void;
  getCurrentSoundIndex: (callback: (index: number) => void) => void;
  isPaused: (callback: (paused: boolean) => void) => void;
};

export type SoundCloudWidgetFactory = {
  Widget: (iframe: HTMLIFrameElement | string) => SoundCloudWidget;
  Events: {
    READY: string;
    PLAY: string;
    PAUSE: string;
    FINISH: string;
    ERROR: string;
  };
};

declare global {
  interface Window {
    SC?: SoundCloudWidgetFactory;
  }
}

const SC_SCRIPT = 'https://w.soundcloud.com/player/api.js';
let scriptPromise: Promise<void> | null = null;

function scReady(): boolean {
  return Boolean(window.SC?.Widget && window.SC?.Events);
}

function waitForScApi(): Promise<void> {
  if (scReady()) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tick = (): void => {
      if (scReady()) {
        resolve();
        return;
      }
      attempts += 1;
      if (attempts > 100) {
        reject(new Error('SoundCloud widget API missing'));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

export function loadSoundCloudWidgetApi(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  if (scReady()) {
    return Promise.resolve();
  }
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-ic-sc-widget]');
      if (existing) {
        void waitForScApi().then(resolve).catch(reject);
        return;
      }
      const script = document.createElement('script');
      script.src = SC_SCRIPT;
      script.async = true;
      script.dataset['icScWidget'] = 'true';
      script.onload = () => {
        void waitForScApi().then(resolve).catch(reject);
      };
      script.onerror = () => reject(new Error('SoundCloud widget script failed'));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export function pickRandomIndex(length: number, avoid?: number): number {
  if (length <= 0) {
    return 0;
  }
  if (length === 1) {
    return 0;
  }
  let index = Math.floor(Math.random() * length);
  while (index === avoid) {
    index = Math.floor(Math.random() * length);
  }
  return index;
}

export function scWidget(iframe: HTMLIFrameElement): SoundCloudWidget | null {
  try {
    return window.SC?.Widget(iframe) ?? null;
  } catch {
    return null;
  }
}

export function scEvents(): SoundCloudWidgetFactory['Events'] | null {
  return window.SC?.Events ?? null;
}
