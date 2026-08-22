import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';

import { LocaleService } from '../../core/locale.service';
import {
  RADIO_DEFAULT_VOLUME,
  SOUNDCLOUD_PLAYLIST_URL,
  soundCloudPlayerSrc,
} from '../../core/radio.constants';
import {
  loadSoundCloudWidgetApi,
  pickRandomIndex,
  scEvents,
  scWidget,
  type SoundCloudWidget,
} from '../../core/soundcloud-widget';

const FRAME_ID = 'ic-radio-player';
const TRACK_HINT = 24;

@Component({
  selector: 'app-radio-widget',
  templateUrl: './radio-widget.html',
  styleUrl: './radio-widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { ngSkipHydration: 'true' },
})
export class RadioWidget implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly copy = inject(LocaleService).copy;
  protected readonly frameId = FRAME_ID;

  protected readonly mounted = signal(false);
  protected readonly loading = signal(false);
  protected readonly playing = signal(false);
  protected readonly muted = signal(true);
  protected readonly frameOpen = signal(false);
  protected readonly error = signal(false);
  protected frameSrc: SafeResourceUrl | null = null;

  private widget: SoundCloudWidget | null = null;
  private track = 0;
  private wantPlay = false;
  private wired = false;
  private bindPromise: Promise<void> | null = null;

  protected readonly playLabel = computed(() => {
    if (this.loading()) {
      return this.copy.radio.loading;
    }
    if (this.error()) {
      return this.copy.radio.error;
    }
    return this.playing() ? this.copy.radio.pause : this.copy.radio.play;
  });

  protected readonly soundLabel = computed(() =>
    this.muted() ? this.copy.radio.soundOn : this.copy.radio.soundOff,
  );

  protected readonly frameLabel = computed(() =>
    this.frameOpen() ? this.copy.radio.closeFrame : this.copy.radio.openFrame,
  );

  constructor() {
    afterNextRender(() => {
      this.track = pickRandomIndex(TRACK_HINT);
      this.frameSrc = this.sanitizer.bypassSecurityTrustResourceUrl(
        soundCloudPlayerSrc(SOUNDCLOUD_PLAYLIST_URL, {
          autoPlay: false,
          startTrack: this.track,
        }),
      );
      this.mounted.set(true);
      void loadSoundCloudWidgetApi().catch(() => undefined);
    });
  }

  ngOnDestroy(): void {
    this.widget = null;
  }

  protected onMuteToggle(): void {
    this.muted.update((m) => !m);
    this.applyVol();
  }

  protected onPlayToggle(): void {
    if (this.playing()) {
      this.widget?.pause();
      this.playing.set(false);
      this.wantPlay = false;
      return;
    }

    this.error.set(false);
    this.wantPlay = true;

    if (this.widget) {
      this.applyVol();
      this.widget.play();
      return;
    }

    this.loading.set(true);
  }

  protected onNext(): void {
    if (!this.widget) {
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

  protected onFrameToggle(): void {
    this.frameOpen.update((v) => !v);
  }

  protected onFrameLoad(): void {
    this.bindPromise ??= this.bindWidget();
  }

  private applyVol(): void {
    this.widget?.setVolume(this.muted() ? 0 : RADIO_DEFAULT_VOLUME);
  }

  private async bindWidget(): Promise<void> {
    if (this.widget) {
      return;
    }
    const frame = document.getElementById(FRAME_ID) as HTMLIFrameElement | null;
    if (!frame?.src) {
      return;
    }

    try {
      await loadSoundCloudWidgetApi();
      const events = scEvents();
      const widget = scWidget(FRAME_ID) ?? scWidget(frame);
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
      this.bindPromise = null;
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
