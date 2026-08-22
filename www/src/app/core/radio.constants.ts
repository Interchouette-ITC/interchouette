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

export const RADIO_WIDGET_ENABLED = envFlag(import.meta.env?.RADIO_WIDGET_ENABLED, true);

export const SOUNDCLOUD_PLAYLIST_URL = 'https://soundcloud.com/labonnevoile/sets/playitc';

export const RADIO_DEFAULT_VOLUME = 60;

export function soundCloudPlayerSrc(
  playlistUrl: string,
  options: { autoPlay?: boolean; startTrack?: number } = {},
): string {
  const params = new URLSearchParams({
    url: playlistUrl,
    visual: 'false',
    show_artwork: 'false',
    show_comments: 'false',
    sharing: 'false',
    buying: 'false',
    download: 'false',
    hide_related: 'true',
    auto_play: options.autoPlay ? 'true' : 'false',
  });
  if (typeof options.startTrack === 'number' && options.startTrack >= 0) {
    params.set('start_track', String(Math.floor(options.startTrack)));
  }
  return `https://w.soundcloud.com/player/?${params.toString()}`;
}
