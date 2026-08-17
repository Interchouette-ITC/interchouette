import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

import { CONSENT_STORAGE_KEY } from './chat.constants';

export type ConsentChoice = 'accepted' | 'rejected';

/**
 * Light non-essential cookie consent (analytics / similar).
 * Essential site + chat storage are described in Privacy; this gate is for optional trackers.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly platformId = inject(PLATFORM_ID);

  /** `null` = not decided yet (show banner). */
  readonly choice = signal<ConsentChoice | null>(null);

  /** Read any stored decision (browser only). */
  hydrate(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (raw === 'accepted' || raw === 'rejected') {
        this.choice.set(raw);
      }
    } catch {
      /* private mode */
    }
  }

  /** True when the visitor has not chosen yet. */
  pending(): boolean {
    return this.choice() === null;
  }

  /** True when non-essential cookies (e.g. GA) may run. */
  acceptsNonEssential(): boolean {
    return this.choice() === 'accepted';
  }

  accept(): void {
    this.persist('accepted');
  }

  reject(): void {
    this.persist('rejected');
  }

  private persist(value: ConsentChoice): void {
    this.choice.set(value);
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, value);
    } catch {
      /* private mode */
    }
  }
}
