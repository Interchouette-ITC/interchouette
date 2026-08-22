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

  it('exposes exactly three controls', () => {
    expect(fixture.componentInstance).toBeTruthy();
    const buttons = fixture.nativeElement.querySelectorAll('.radio__btn');
    expect(buttons.length).toBe(3);
  });
});
