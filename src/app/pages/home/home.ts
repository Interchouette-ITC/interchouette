import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly year = signal(new Date().getFullYear());
  protected readonly currentYear = computed(() => this.year());
  protected readonly mailHref = 'mailto:contact@interchouette.net';
  protected readonly whatsappHref = 'https://wa.me/31620808454';
}
