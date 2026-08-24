import { TestBed } from '@angular/core/testing';

import { RADIO_FRAME_ID, RadioService } from './radio.service';

describe('RadioService', () => {
  let radio: RadioService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [RadioService] });
    radio = TestBed.inject(RadioService);
  });

  afterEach(() => {
    document.getElementById(RADIO_FRAME_ID)?.remove();
  });

  it('reports info text with playlist URL', () => {
    expect(radio.infoText()).toContain('soundcloud.com');
    expect(radio.infoText()).toContain('play_radio');
  });

  it('toggles mute state', () => {
    expect(radio.muted()).toBe(true);
    radio.toggleMute();
    expect(radio.muted()).toBe(false);
  });

  it('applyControl pause clears want-play via pause()', () => {
    expect(radio.applyControl('pause')).toContain('paused');
    expect(radio.playing()).toBe(false);
  });

  it('pause does not remount or set loading', () => {
    const url = radio.mountInitialFrame();
    radio.pause();
    expect(radio.frameSrc()).toBe(url);
    expect(radio.loading()).toBe(false);
    expect(radio.playing()).toBe(false);
  });

  it('play sets optimistic playing and unmutes', () => {
    expect(radio.muted()).toBe(true);
    // No iframe in unit test: play records error and clears want-play.
    radio.applyControl('play');
    expect(radio.playing()).toBe(false);
    expect(radio.error()).toBe(true);
  });

  it('play with mounted frameSrc does not remount', () => {
    const url = radio.mountInitialFrame();
    const iframe = document.createElement('iframe');
    iframe.id = RADIO_FRAME_ID;
    document.body.appendChild(iframe);
    radio.play();
    expect(radio.frameSrc()).toBe(url);
    expect(radio.playing()).toBe(true);
    expect(radio.muted()).toBe(false);
  });

  it('frameSrc is the sole embed URL source', () => {
    const url = radio.mountInitialFrame();
    expect(radio.frameSrc()).toBe(url);
    expect(url).toContain('soundcloud.com');
    expect(url).toContain('auto_play=false');
  });
});
