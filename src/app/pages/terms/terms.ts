import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-terms-page',
  imports: [RouterLink],
  templateUrl: './terms.html',
  styleUrl: './terms.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsPage {}
