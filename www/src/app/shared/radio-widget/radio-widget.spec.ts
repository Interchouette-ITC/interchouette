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

  it('exposes the switch and side actions', () => {
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.radio__toggle')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.radio__sound')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.radio__frame-btn')).toBeTruthy();
  });
});
