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

  it('creates and exposes play label before boot', () => {
    expect(fixture.componentInstance).toBeTruthy();
    const btn: HTMLButtonElement | null = fixture.nativeElement.querySelector('.radio-btn');
    expect(btn).toBeTruthy();
    expect(btn?.getAttribute('aria-label')).toContain('radio');
  });
});
