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

  it('exposes three separate controls', () => {
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.radio__btn--sound')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.radio__btn--play')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.radio__btn--frame')).toBeTruthy();
  });
});
