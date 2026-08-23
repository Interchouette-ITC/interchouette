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
import { RADIO_FRAME_ID, RadioService } from '../../core/radio.service';

@Component({
  selector: 'app-radio-widget',
  templateUrl: './radio-widget.html',
  styleUrl: './radio-widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { ngSkipHydration: 'true' },
})
export class RadioWidget implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly radio = inject(RadioService);

  protected readonly copy = inject(LocaleService).copy;
  protected readonly frameId = RADIO_FRAME_ID;

  protected readonly mounted = this.radio.mounted;
  protected readonly loading = this.radio.loading;
  protected readonly playing = this.radio.playing;
  protected readonly muted = this.radio.muted;
  protected readonly frameOpen = this.radio.frameOpen;
  protected readonly error = this.radio.error;

  protected readonly frameSrc = signal<SafeResourceUrl | null>(null);

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
      const url = this.radio.mountInitialFrame();
      this.frameSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
      this.radio.markMounted();
    });
  }

  ngOnDestroy(): void {
    this.radio.detach();
  }

  protected onMuteToggle(): void {
    this.radio.toggleMute();
  }

  protected onPlayToggle(): void {
    this.radio.togglePlay();
    this.syncFrameSrc();
  }

  protected onNext(): void {
    this.radio.next();
  }

  protected onFrameToggle(): void {
    this.radio.toggleFrame();
  }

  protected onFrameLoad(): void {
    this.radio.onFrameLoad();
  }

  private syncFrameSrc(): void {
    const url = this.radio.frameSrcUrl();
    this.frameSrc.set(url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null);
  }
}
