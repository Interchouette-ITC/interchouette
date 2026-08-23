import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LocaleService } from '../../core/locale.service';
import { RadioWidget } from './radio-widget';

describe('RadioWidget', () => {
  let fixture: ComponentFixture<RadioWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RadioWidget],
      providers: [provideRouter([]), LocaleService],
    }).compileComponents();

    fixture = TestBed.createComponent(RadioWidget);
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('exposes radio control labels', () => {
    const cmp = fixture.componentInstance as unknown as {
      playLabel: () => string;
    };
    expect(cmp.playLabel().length).toBeGreaterThan(0);
  });
});
