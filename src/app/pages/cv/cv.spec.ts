import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CvPage } from './cv';

describe('CvPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CvPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('links to the PDF download', () => {
    const fixture = TestBed.createComponent(CvPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const pdf = el.querySelector('a[href="/CV/Gregory_Roussac.pdf"]');

    expect(pdf).toBeTruthy();
    expect(pdf?.getAttribute('target')).toBe('_blank');
    expect(pdf?.getAttribute('rel')).toContain('noopener');
  });
});
