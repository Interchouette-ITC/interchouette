import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-cv-page',
  templateUrl: './cv.html',
  styleUrl: './cv.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CvPage {}
