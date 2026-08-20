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

export function loadSoundCloudWidgetApi(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  if (window.SC?.Widget) {
    return Promise.resolve();
  }
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-ic-sc-widget]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error('SoundCloud widget script failed')),
          {
            once: true,
          },
        );
        return;
      }
      const script = document.createElement('script');
      script.src = SC_SCRIPT;
      script.async = true;
      script.dataset['icScWidget'] = 'true';
      script.onload = () => resolve();
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
  return window.SC?.Widget(iframe) ?? null;
}

export function scEvents(): SoundCloudWidgetFactory['Events'] | null {
  return window.SC?.Events ?? null;
}
