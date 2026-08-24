import { Injectable, signal } from '@angular/core';

import {
  RADIO_DEFAULT_VOLUME,
  SOUNDCLOUD_PLAYLIST_URL,
  soundCloudPlayerSrc,
} from './radio.constants';
import { icConsoleWrite } from './ic-console';
import {
  loadSoundCloudWidgetApi,
  pickRandomIndex,
  scEvents,
  scWidget,
  type SoundCloudWidget,
} from './soundcloud-widget';

/** Browser event for chat / agents to drive the home radio. */
export const RADIO_CONTROL_EVENT = 'interchouette:radio';

export type RadioControlAction = 'play' | 'pause' | 'toggle' | 'next' | 'mute';

export type RadioControlDetail = {
  action: RadioControlAction;
};

export const RADIO_FRAME_ID = 'ic-radio-player';
const TRACK_HINT = 24;

/**
 * SoundCloud Play ITC controller shared by the home widget, WebMCP, and chat
 * `[[PLAYLIST: …]]` bridge.
 *
 * `frameSrc` is the single source of truth for the iframe URL (Angular binding).
 * Never assign `iframe.src` directly or change detection will snap back to a stale URL.
 */
@Injectable({ providedIn: 'root' })
export class RadioService {
  readonly playing = signal(false);
  readonly muted = signal(true);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly frameOpen = signal(false);
  readonly mounted = signal(false);
  /** Raw SoundCloud embed URL bound by the widget template. */
  readonly frameSrc = signal<string | null>(null);

  private widget: SoundCloudWidget | null = null;
  private track = 0;
  private wantPlay = false;
  private wired = false;
  private listening = false;
  /** Ignore a transient PAUSE while SoundCloud is starting playback we requested. */
  private playPending = false;

  /** Start listening for `interchouette:radio` (idempotent; call from widget). */
  ensureListening(): void {
    if (this.listening || typeof window === 'undefined') {
      return;
    }
    this.listening = true;
    window.addEventListener(RADIO_CONTROL_EVENT, this.onControlEvent);
  }

  destroyListening(): void {
    if (!this.listening || typeof window === 'undefined') {
      return;
    }
    window.removeEventListener(RADIO_CONTROL_EVENT, this.onControlEvent);
    this.listening = false;
  }

  /** Prepare initial (paused) player URL after first paint. Call `markMounted` after bind. */
  mountInitialFrame(): string {
    this.track = pickRandomIndex(TRACK_HINT);
    const url = soundCloudPlayerSrc(SOUNDCLOUD_PLAYLIST_URL, {
      autoPlay: false,
      startTrack: this.track,
    });
    this.frameSrc.set(url);
    void loadSoundCloudWidgetApi().catch(() => undefined);
    this.ensureListening();
    return url;
  }

  /** Show the widget once the template has a trusted iframe URL. */
  markMounted(): void {
    this.mounted.set(true);
  }

  detach(): void {
    this.widget = null;
    this.wired = false;
    this.wantPlay = false;
    this.playPending = false;
    this.frameSrc.set(null);
    this.playing.set(false);
    this.loading.set(false);
    this.error.set(false);
    this.frameOpen.set(false);
    this.mounted.set(false);
    this.destroyListening();
  }

  infoText(): string {
    return [
      'Interchouette radio (Play ITC SoundCloud playlist).',
      `Playlist: ${SOUNDCLOUD_PLAYLIST_URL}`,
      `Playing: ${this.playing()}`,
      `Muted: ${this.muted()}`,
      `Loading: ${this.loading()}`,
      `Error: ${this.error()}`,
      'Controls: play_radio, pause_radio, toggle_radio, next_radio_track, toggle_radio_mute.',
      'Remote MCP only returns metadata (get_radio_info); playback is in-browser / WebMCP.',
    ].join('\n');
  }

  toggleMute(): void {
    this.muted.update((m) => !m);
    this.applyVol();
  }

  toggleFrame(): void {
    this.frameOpen.update((v) => !v);
  }

  pause(): void {
    this.wantPlay = false;
    this.playPending = false;
    this.playing.set(false);
    this.loading.set(false);
    // Never remount on pause: that reloads the SoundCloud embed and flashes loading.
    this.widget?.pause();
  }

  play(): void {
    this.error.set(false);
    this.wantPlay = true;
    this.playing.set(true);
    if (this.muted()) {
      this.muted.set(false);
    }

    // Prefer the live Widget API. Remounting here reloads the embed and breaks pause→play.
    if (this.widget) {
      this.applyVol();
      this.playPending = true;
      this.widget.play();
      return;
    }

    if (typeof document !== 'undefined' && !document.getElementById(RADIO_FRAME_ID)) {
      this.error.set(true);
      this.playing.set(false);
      this.wantPlay = false;
      icConsoleWrite({
        ns: 'ic:radio',
        topic: 'play',
        level: 'warn',
        kv: { err: 'iframe missing (open home page)' },
      });
      return;
    }

    // Iframe already mounted: wait for bindWidget (wantPlay) instead of nuking src.
    if (this.frameSrc()) {
      this.loading.set(true);
      void this.bindWidget();
      return;
    }

    this.remount(true);
  }

  togglePlay(): void {
    if (this.playing() || this.wantPlay) {
      this.pause();
      return;
    }
    this.play();
  }

  next(): void {
    if (!this.widget) {
      this.play();
      return;
    }
    this.wantPlay = true;
    this.playing.set(true);
    if (this.muted()) {
      this.muted.set(false);
    }
    this.applyVol();
    const widget = this.widget;
    widget.getCurrentSoundIndex((current) => {
      widget.getSounds((sounds) => {
        if (sounds.length === 0) {
          return;
        }
        this.track = (current + 1) % sounds.length;
        widget.skip(this.track);
        this.playPending = true;
        widget.play();
      });
    });
  }

  onFrameLoad(): void {
    void this.bindWidget();
  }

  applyControl(action: RadioControlAction): string {
    switch (action) {
      case 'play':
        this.play();
        return 'Radio play requested.';
      case 'pause':
        this.pause();
        return 'Radio paused.';
      case 'toggle':
        this.togglePlay();
        return this.playing() || this.wantPlay ? 'Radio play toggled on.' : 'Radio paused.';
      case 'next':
        this.next();
        return 'Next track requested.';
      case 'mute':
        this.toggleMute();
        return this.muted() ? 'Radio muted.' : 'Radio unmuted.';
      default:
        return 'Unknown radio action.';
    }
  }

  private remount(autoPlay: boolean): void {
    this.loading.set(true);
    this.widget = null;
    this.wired = false;
    const url = soundCloudPlayerSrc(SOUNDCLOUD_PLAYLIST_URL, {
      autoPlay,
      startTrack: this.track,
    });
    this.frameSrc.set(url);
  }

  private readonly onControlEvent = (ev: Event): void => {
    const detail = (ev as CustomEvent<RadioControlDetail>).detail;
    const action = detail?.action;
    if (
      action !== 'play' &&
      action !== 'pause' &&
      action !== 'toggle' &&
      action !== 'next' &&
      action !== 'mute'
    ) {
      return;
    }
    this.applyControl(action);
  };

  private applyVol(): void {
    this.widget?.setVolume(this.muted() ? 0 : RADIO_DEFAULT_VOLUME);
  }

  private async bindWidget(): Promise<void> {
    if (this.widget) {
      return;
    }
    const frame = document.getElementById(RADIO_FRAME_ID) as HTMLIFrameElement | null;
    if (!frame?.src) {
      return;
    }

    try {
      await loadSoundCloudWidgetApi();
      const events = scEvents();
      const widget = scWidget(RADIO_FRAME_ID) ?? scWidget(frame);
      if (!widget) {
        throw new Error('SoundCloud widget missing');
      }

      if (!this.wired) {
        this.wire(widget, events);
        this.wired = true;
      }
      await this.waitReady(widget, events.READY);
      this.widget = widget;
      this.applyVol();
      this.loading.set(false);

      if (this.wantPlay) {
        this.playPending = true;
        widget.play();
      } else {
        widget.pause();
      }
    } catch {
      this.error.set(true);
      if (!this.wantPlay) {
        this.playing.set(false);
      }
      this.widget = null;
      this.loading.set(false);
    }
  }

  private waitReady(widget: SoundCloudWidget, readyEvent: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('SoundCloud widget timeout'));
        }
      }, 20000);
      widget.bind(readyEvent, done);
      widget.getSounds(() => done());
    });
  }

  private wire(widget: SoundCloudWidget, events: NonNullable<ReturnType<typeof scEvents>>): void {
    widget.bind(events.PLAY, () => {
      this.playPending = false;
      this.wantPlay = true;
      this.playing.set(true);
      this.loading.set(false);
      this.applyVol();
    });
    widget.bind(events.PAUSE, () => {
      if (this.playPending) {
        return;
      }
      this.wantPlay = false;
      this.playing.set(false);
    });
    widget.bind(events.FINISH, () => {
      widget.getCurrentSoundIndex((current) => {
        widget.getSounds((sounds) => {
          this.track = pickRandomIndex(sounds.length, current);
          widget.skip(this.track);
          this.playPending = true;
          widget.play();
        });
      });
    });
  }
}

/** Dispatch a radio control event (used by chat PLAYLIST tags). */
export function dispatchRadioControl(action: RadioControlAction): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<RadioControlDetail>(RADIO_CONTROL_EVENT, { detail: { action } }),
  );
}
