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

/** From repo-root `.env` (`RADIO_WIDGET_ENABLED`). Restart `ng serve` after changes. */
export const RADIO_WIDGET_ENABLED = envFlag(import.meta.env?.RADIO_WIDGET_ENABLED, true);

/** Public SoundCloud playlist for site radio. */
export const SOUNDCLOUD_PLAYLIST_URL = 'https://soundcloud.com/labonnevoile/sets/interchouette';

export const RADIO_STORAGE_KEY = 'ic.radio.v1';

/** Default playback volume (0-100) when not muted. */
export const RADIO_DEFAULT_VOLUME = 35;

export type RadioPrefs = {
  muted: boolean;
  volume: number;
};

export function soundCloudPlayerSrc(playlistUrl: string): string {
  const params = new URLSearchParams({
    url: playlistUrl,
    visual: 'false',
    show_artwork: 'false',
    show_comments: 'false',
    sharing: 'false',
    buying: 'false',
    download: 'false',
    hide_related: 'true',
  });
  return `https://w.soundcloud.com/player/?${params.toString()}`;
}

export function readRadioPrefs(): RadioPrefs {
  if (typeof localStorage === 'undefined') {
    return { muted: false, volume: RADIO_DEFAULT_VOLUME };
  }
  try {
    const raw = localStorage.getItem(RADIO_STORAGE_KEY);
    if (!raw) {
      return { muted: false, volume: RADIO_DEFAULT_VOLUME };
    }
    const parsed = JSON.parse(raw) as Partial<RadioPrefs>;
    const volume =
      typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 100
        ? parsed.volume
        : RADIO_DEFAULT_VOLUME;
    return { muted: parsed.muted === true, volume };
  } catch {
    return { muted: false, volume: RADIO_DEFAULT_VOLUME };
  }
}

export function writeRadioPrefs(prefs: RadioPrefs): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(RADIO_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode */
  }
}
