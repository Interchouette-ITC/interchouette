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
  protected readonly playing = signal(false);
  protected readonly error = signal(false);

  private widget: SoundCloudWidget | null = null;
  private wired = false;
  private prefs: RadioPrefs = readRadioPrefs();
  private lastIndex = -1;

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
    if (this.widget) {
      this.widget.isPaused((paused) => {
        if (paused) {
          this.play();
        } else {
          this.widget?.pause();
          this.playing.set(false);
        }
      });
      return;
    }
    void this.boot();
  }

  private frameElement(): HTMLIFrameElement | null {
    return document.getElementById(FRAME_ID) as HTMLIFrameElement | null;
  }

  private async boot(): Promise<void> {
    this.error.set(false);
    this.loading.set(true);
    try {
      await loadSoundCloudWidgetApi();
      const frame = this.frameElement();
      if (!frame) {
        throw new Error('radio iframe missing');
      }
      await this.ensureWidget(frame);
      this.applyVolume();
      await this.shuffleAndPlay();
    } catch (err) {
      this.error.set(true);
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

  private ensureWidget(frame: HTMLIFrameElement): Promise<void> {
    const src = soundCloudPlayerSrc(SOUNDCLOUD_PLAYLIST_URL);
    return new Promise((resolve, reject) => {
      const attach = (): void => {
        const events = scEvents();
        const widget = scWidget(FRAME_ID) ?? scWidget(frame);
        if (!events) {
          reject(new Error('SoundCloud events missing'));
          return;
        }
        if (!widget) {
          reject(new Error('SoundCloud widget missing'));
          return;
        }
        this.widget = widget;
        if (!this.wired) {
          this.wireWidget(widget, events);
          this.wired = true;
        }
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error('SoundCloud widget timeout'));
          }
        }, 20000);
        widget.bind(events.READY, () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            icConsoleWrite({
              ns: 'ic:radio',
              topic: 'ready',
              kv: { meaning: 'click play again if you did not hear audio on first click' },
            });
            resolve();
          }
        });
      };

      if (!frame.src) {
        frame.src = src;
      }
      if (frame.contentWindow && frame.src) {
        attach();
        return;
      }
      frame.addEventListener(
        'load',
        () => {
          attach();
        },
        { once: true },
      );
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
          this.play();
        });
      });
    });
  }

  private shuffleAndPlay(): Promise<void> {
    return new Promise((resolve, reject) => {
      const widget = this.widget;
      if (!widget) {
        reject(new Error('widget missing'));
        return;
      }
      const tryShuffle = (attempt: number): void => {
        widget.getSounds((sounds) => {
          if (!sounds.length) {
            if (attempt < 15) {
              setTimeout(() => tryShuffle(attempt + 1), 200);
              return;
            }
            reject(new Error('empty playlist'));
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
          this.play();
          resolve();
        });
      };
      tryShuffle(0);
    });
  }

  private play(): void {
    const widget = this.widget;
    if (!widget || this.prefs.muted) {
      return;
    }
    this.applyVolume();
    widget.play();
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
