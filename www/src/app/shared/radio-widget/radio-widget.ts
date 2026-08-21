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
  protected readonly ready = signal(false);
  protected readonly playing = signal(false);
  protected readonly error = signal(false);

  private widget: SoundCloudWidget | null = null;
  private wired = false;
  private prefs: RadioPrefs = readRadioPrefs();
  private lastIndex = -1;
  private apiLoaded = false;

  protected readonly buttonLabel = computed(() => {
    const radio = this.copy.radio;
    if (this.loading()) {
      return radio.loading;
    }
    if (this.error()) {
      return radio.error;
    }
    return this.playing() ? radio.pause : radio.play;
  });

  constructor() {
    afterNextRender(() => {
      this.mounted.set(true);
      void this.warmApi();
    });
  }

  ngOnDestroy(): void {
    this.widget?.pause();
    this.widget = null;
  }

  protected onToggle(): void {
    if (this.loading()) {
      return;
    }

    // Pause uses local state so we never wait on SC postMessage inside the click.
    if (this.playing()) {
      icConsoleWrite({ ns: 'ic:radio', topic: 'click', kv: { intent: 'pause' } });
      this.widget?.pause();
      this.playing.set(false);
      return;
    }

    icConsoleWrite({
      ns: 'ic:radio',
      topic: 'click',
      kv: {
        intent: 'play',
        meaning: 'start Interchouette playlist audio (random track)',
        volume: this.prefs.volume,
      },
    });

    // Set iframe src with auto_play during the click (keeps user gesture for audio).
    const frame = document.getElementById(FRAME_ID) as HTMLIFrameElement | null;
    if (!frame) {
      this.error.set(true);
      return;
    }
    this.error.set(false);
    this.loading.set(true);
    frame.src = soundCloudPlayerSrc(SOUNDCLOUD_PLAYLIST_URL, true);
    void this.bindAfterLoad(frame);
  }

  private async warmApi(): Promise<void> {
    try {
      await loadSoundCloudWidgetApi();
      this.apiLoaded = true;
    } catch (err) {
      icConsoleWrite({
        ns: 'ic:radio',
        topic: 'api',
        level: 'warn',
        kv: { err: err instanceof Error ? err.message : String(err) },
      });
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
      this.ready.set(true);
      this.applyVolume();
      // auto_play may already be going; still shuffle to a random track
      this.shuffleCurrent();
      // Nudge play again after READY (second click not required if auto_play worked)
      widget.play();
      this.playing.set(true);
      icConsoleWrite({
        ns: 'ic:radio',
        topic: 'ready',
        kv: { meaning: 'widget ready; play requested' },
      });
    } catch (err) {
      this.error.set(true);
      this.playing.set(false);
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
      if (frame.contentDocument?.readyState === 'complete' && frame.src.includes('soundcloud')) {
        resolve();
        return;
      }
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
          widget.play();
        });
      });
    });
  }

  private shuffleCurrent(): void {
    const widget = this.widget;
    if (!widget) {
      return;
    }
    widget.getSounds((sounds) => {
      if (sounds.length <= 1) {
        return;
      }
      const index = pickRandomIndex(sounds.length, this.lastIndex);
      this.lastIndex = index;
      icConsoleWrite({
        ns: 'ic:radio',
        topic: 'shuffle',
        kv: { index, of: sounds.length, title: sounds[index]?.title ?? 'unknown' },
      });
      widget.skip(index);
      widget.setVolume(this.prefs.muted ? 0 : this.prefs.volume);
      widget.play();
    });
  }

  private applyVolume(): void {
    this.widget?.setVolume(this.prefs.muted ? 0 : this.prefs.volume);
  }

  /** Exposed for tests. */
  protected persistPrefs(prefs: RadioPrefs): void {
    this.prefs = prefs;
    writeRadioPrefs(prefs);
    this.applyVolume();
  }
}
