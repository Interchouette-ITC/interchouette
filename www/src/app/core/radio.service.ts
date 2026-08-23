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
 */
@Injectable({ providedIn: 'root' })
export class RadioService {
  readonly playing = signal(false);
  readonly muted = signal(true);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly frameOpen = signal(false);
  readonly mounted = signal(false);

  private widget: SoundCloudWidget | null = null;
  private track = 0;
  private wantPlay = false;
  private wired = false;
  private unlocked = false;
  private listening = false;
  private frameSrcRaw: string | null = null;

  /** Current iframe URL (for the widget template). */
  frameSrcUrl(): string | null {
    return this.frameSrcRaw;
  }

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

  /** Prepare initial (paused) player URL after first paint. Call `markMounted` after binding `frameSrc`. */
  mountInitialFrame(): string {
    this.track = pickRandomIndex(TRACK_HINT);
    this.frameSrcRaw = soundCloudPlayerSrc(SOUNDCLOUD_PLAYLIST_URL, {
      autoPlay: false,
      startTrack: this.track,
    });
    void loadSoundCloudWidgetApi().catch(() => undefined);
    this.ensureListening();
    return this.frameSrcRaw;
  }

  /** Show the widget once the template has a trusted iframe URL. */
  markMounted(): void {
    this.mounted.set(true);
  }

  detach(): void {
    this.widget = null;
    this.wired = false;
    this.unlocked = false;
    this.wantPlay = false;
    this.frameSrcRaw = null;
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
    this.widget?.pause();
    this.playing.set(false);
    this.wantPlay = false;
  }

  play(): void {
    this.error.set(false);
    this.wantPlay = true;

    if (this.unlocked && this.widget) {
      this.applyVol();
      this.widget.play();
      return;
    }

    const frame = document.getElementById(RADIO_FRAME_ID) as HTMLIFrameElement | null;
    if (!frame) {
      this.error.set(true);
      icConsoleWrite({
        ns: 'ic:radio',
        topic: 'play',
        level: 'warn',
        kv: { err: 'iframe missing (open home page)' },
      });
      return;
    }

    this.loading.set(true);
    this.widget = null;
    this.wired = false;

    const url = soundCloudPlayerSrc(SOUNDCLOUD_PLAYLIST_URL, {
      autoPlay: true,
      startTrack: this.track,
    });
    this.frameSrcRaw = url;
    frame.src = url;
  }

  togglePlay(): void {
    if (this.playing()) {
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
    this.applyVol();
    const widget = this.widget;
    widget.getCurrentSoundIndex((current) => {
      widget.getSounds((sounds) => {
        if (sounds.length === 0) {
          return;
        }
        this.track = (current + 1) % sounds.length;
        widget.skip(this.track);
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
        widget.play();
      }
    } catch {
      this.error.set(true);
      this.playing.set(false);
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
      this.unlocked = true;
      this.playing.set(true);
      this.loading.set(false);
      this.applyVol();
    });
    widget.bind(events.PAUSE, () => this.playing.set(false));
    widget.bind(events.FINISH, () => {
      widget.getCurrentSoundIndex((current) => {
        widget.getSounds((sounds) => {
          this.track = pickRandomIndex(sounds.length, current);
          widget.skip(this.track);
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
