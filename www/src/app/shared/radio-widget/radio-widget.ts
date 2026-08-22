import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';

import { icConsoleWrite } from '../../core/ic-console';
import { LocaleService } from '../../core/locale.service';
import {
  readRadioPrefs,
  SOUNDCLOUD_PLAYLIST_URL,
  soundCloudPlayerSrc,
  writeRadioPrefs,
  type RadioPrefs,
} from '../../core/radio.constants';
import {
  loadSoundCloudWidgetApi,
  pickRandomIndex,
  scEvents,
  scWidget,
  type SoundCloudWidget,
} from '../../core/soundcloud-widget';

const FRAME_ID = 'ic-radio-player';
const PLAYLIST_TRACK_HINT = 24;

@Component({
  selector: 'app-radio-widget',
  templateUrl: './radio-widget.html',
  styleUrl: './radio-widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    ngSkipHydration: 'true',
  },
})
export class RadioWidget implements OnDestroy {
  protected readonly copy = inject(LocaleService).copy;
  protected readonly frameId = FRAME_ID;

  protected readonly mounted = signal(false);
  protected readonly loading = signal(false);
  protected readonly playing = signal(false);
  protected readonly muted = signal(false);
  protected readonly frameOpen = signal(false);
  protected readonly error = signal(false);

  private widget: SoundCloudWidget | null = null;
  private wired = false;
  private prefs: RadioPrefs = readRadioPrefs();
  private lastIndex = -1;
  private apiLoaded = false;

  protected readonly playLabel = computed(() => {
    const radio = this.copy.radio;
    if (this.loading()) {
      return radio.loading;
    }
    if (this.error()) {
      return radio.error;
    }
    return this.playing() ? radio.pause : radio.play;
  });

  protected readonly soundLabel = computed(() =>
    this.muted() ? this.copy.radio.soundOn : this.copy.radio.soundOff,
  );

  protected readonly frameLabel = computed(() =>
    this.frameOpen() ? this.copy.radio.closeFrame : this.copy.radio.openFrame,
  );

  constructor() {
    afterNextRender(() => {
      this.mounted.set(true);
      this.muted.set(this.prefs.muted);
      void this.warmApi();
    });
  }

  ngOnDestroy(): void {
    this.widget?.pause();
    this.widget = null;
  }

  /** Sound on/off only. */
  protected onSoundToggle(): void {
    const next = !this.muted();
    this.muted.set(next);
    this.prefs = { ...this.prefs, muted: next };
    writeRadioPrefs(this.prefs);
    this.applyVolume();
    icConsoleWrite({ ns: 'ic:radio', topic: 'sound', kv: { muted: next } });
  }

  /** Play / pause only. Never flips mute or frame. */
  protected onPlayToggle(): void {
    if (this.loading()) {
      return;
    }

    if (this.playing()) {
      icConsoleWrite({ ns: 'ic:radio', topic: 'play', kv: { intent: 'pause' } });
      this.widget?.pause();
      this.playing.set(false);
      return;
    }

    icConsoleWrite({
      ns: 'ic:radio',
      topic: 'play',
      kv: { intent: 'play', muted: this.muted(), volume: this.prefs.volume },
    });
    this.error.set(false);

    if (this.widget) {
      this.applyVolume();
      this.widget.play();
      // PLAY event sets playing=true; keep false until then so a failed start
      // is not treated as "on" (which caused click 2 = pause).
      return;
    }

    const frame = document.getElementById(FRAME_ID) as HTMLIFrameElement | null;
    if (!frame) {
      this.error.set(true);
      return;
    }

    this.loading.set(true);
    this.lastIndex = pickRandomIndex(PLAYLIST_TRACK_HINT);
    // Sync in the click: unlock autoplay. Frame stays full-size off-screen until opened.
    frame.src = soundCloudPlayerSrc(SOUNDCLOUD_PLAYLIST_URL, {
      autoPlay: !this.muted(),
      startTrack: this.lastIndex,
    });
    void this.bindAfterLoad(frame);
  }

  /** Show / hide iframe below the controls (right side). */
  protected onFrameToggle(): void {
    const next = !this.frameOpen();
    this.frameOpen.set(next);
    icConsoleWrite({ ns: 'ic:radio', topic: 'frame', kv: { open: next } });
  }

  private async warmApi(): Promise<void> {
    try {
      await loadSoundCloudWidgetApi();
      this.apiLoaded = true;
    } catch {
      /* first play will retry */
    }
  }

  private async bindAfterLoad(frame: HTMLIFrameElement): Promise<void> {
    try {
      if (!this.apiLoaded) {
        await loadSoundCloudWidgetApi();
        this.apiLoaded = true;
      }
      await this.waitFrameLoad(frame);
      const events = scEvents();
      const widget = scWidget(FRAME_ID) ?? scWidget(frame);
      if (!widget) {
        throw new Error('SoundCloud widget missing');
      }
      this.widget = widget;
      if (!this.wired) {
        this.wireWidget(widget, events);
        this.wired = true;
      }
      await this.waitReady(widget, events.READY);
      this.applyVolume();
      if (!this.muted()) {
        widget.play();
      }
      icConsoleWrite({
        ns: 'ic:radio',
        topic: 'ready',
        kv: { startTrack: this.lastIndex },
      });
    } catch (err) {
      this.error.set(true);
      this.playing.set(false);
      this.widget = null;
      icConsoleWrite({
        ns: 'ic:radio',
        topic: 'boot',
        level: 'error',
        kv: { err: err instanceof Error ? err.message : String(err) },
      });
    } finally {
      this.loading.set(false);
    }
  }

  private waitFrameLoad(frame: HTMLIFrameElement): Promise<void> {
    return new Promise((resolve) => {
      frame.addEventListener('load', () => resolve(), { once: true });
    });
  }

  private waitReady(widget: SoundCloudWidget, readyEvent: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('SoundCloud widget timeout'));
        }
      }, 20000);
      widget.bind(readyEvent, () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  private wireWidget(
    widget: SoundCloudWidget,
    events: NonNullable<ReturnType<typeof scEvents>>,
  ): void {
    widget.bind(events.PLAY, () => {
      this.playing.set(true);
      widget.getCurrentSound((sound) => {
        icConsoleWrite({
          ns: 'ic:radio',
          topic: 'playing',
          kv: { title: sound?.title ?? 'unknown', volume: this.prefs.volume },
        });
      });
    });
    widget.bind(events.PAUSE, () => this.playing.set(false));
    widget.bind(events.FINISH, () => {
      widget.getCurrentSoundIndex((current) => {
        widget.getSounds((sounds) => {
          const next = pickRandomIndex(sounds.length, current);
          this.lastIndex = next;
          widget.skip(next);
          if (!this.muted()) {
            widget.play();
          }
        });
      });
    });
  }

  private applyVolume(): void {
    this.widget?.setVolume(this.muted() ? 0 : this.prefs.volume);
  }

  /** Exposed for tests. */
  protected persistPrefs(prefs: RadioPrefs): void {
    this.prefs = prefs;
    this.muted.set(prefs.muted);
    writeRadioPrefs(prefs);
    this.applyVolume();
  }
}
