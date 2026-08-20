import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';

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
  private readonly playerFrame = viewChild<ElementRef<HTMLIFrameElement>>('playerFrame');

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

  protected async onToggle(): Promise<void> {
    if (this.widget) {
      this.widget.isPaused((paused) => {
        if (paused) {
          this.resume();
        } else {
          this.widget?.pause();
          this.playing.set(false);
        }
      });
      return;
    }
    if (this.loading()) {
      return;
    }
    await this.boot();
  }

  private frameElement(): HTMLIFrameElement | null {
    const ref = this.playerFrame() as ElementRef<HTMLIFrameElement> | HTMLIFrameElement | undefined;
    if (ref instanceof HTMLIFrameElement) {
      return ref;
    }
    if (ref?.nativeElement) {
      return ref.nativeElement;
    }
    return document.querySelector<HTMLIFrameElement>('app-radio-widget iframe.radio-frame');
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
      await this.waitForWidget(frame, SOUNDCLOUD_PLAYLIST_URL);
      this.applyVolume();
      await this.shuffleAndPlay();
    } catch {
      this.error.set(true);
      this.playing.set(false);
    } finally {
      this.loading.set(false);
    }
  }

  private waitForWidget(frame: HTMLIFrameElement, playlistUrl: string): Promise<void> {
    frame.src = soundCloudPlayerSrc(playlistUrl);
    return new Promise((resolve, reject) => {
      const events = scEvents();
      const widget = scWidget(frame);
      if (!events || !widget) {
        reject(new Error('SoundCloud widget unavailable'));
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
          resolve();
        }
      });
    });
  }

  private wireWidget(
    widget: SoundCloudWidget,
    events: NonNullable<ReturnType<typeof scEvents>>,
  ): void {
    widget.bind(events.PLAY, () => this.playing.set(true));
    widget.bind(events.PAUSE, () => this.playing.set(false));
    widget.bind(events.FINISH, () => {
      widget.getCurrentSoundIndex((current) => {
        widget.getSounds((sounds) => {
          const next = pickRandomIndex(sounds.length, current);
          this.lastIndex = next;
          widget.skip(next);
          this.resume();
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
            if (attempt < 10) {
              setTimeout(() => tryShuffle(attempt + 1), 200);
              return;
            }
            reject(new Error('empty playlist'));
            return;
          }
          const index = pickRandomIndex(sounds.length, this.lastIndex);
          this.lastIndex = index;
          widget.skip(index);
          this.resume();
          resolve();
        });
      };
      tryShuffle(0);
    });
  }

  private resume(): void {
    const widget = this.widget;
    if (!widget || this.prefs.muted) {
      return;
    }
    this.applyVolume();
    widget.play();
  }

  private applyVolume(): void {
    const widget = this.widget;
    if (!widget) {
      return;
    }
    widget.setVolume(this.prefs.muted ? 0 : this.prefs.volume);
  }

  /** Exposed for tests. */
  protected persistPrefs(prefs: RadioPrefs): void {
    this.prefs = prefs;
    writeRadioPrefs(prefs);
    this.applyVolume();
  }
}
