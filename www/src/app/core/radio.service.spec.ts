import { TestBed } from '@angular/core/testing';

import { RadioService } from './radio.service';

describe('RadioService', () => {
  let radio: RadioService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [RadioService] });
    radio = TestBed.inject(RadioService);
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
});
