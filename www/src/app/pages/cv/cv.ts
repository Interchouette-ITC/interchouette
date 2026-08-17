import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-cv-page',
  imports: [RouterLink],
  templateUrl: './cv.html',
  styleUrl: './cv.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CvPage {}
