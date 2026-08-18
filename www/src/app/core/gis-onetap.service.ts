import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

import { CustomerSession } from './customer-session';
import { GIS_CLIENT_ID } from './gis.constants';
import { initGisOneTap, openGisSignIn } from './gis-signin';

@Injectable({ providedIn: 'root' })
export class GisOneTapService {
  private readonly session = inject(CustomerSession);
  private readonly router = inject(Router);
  private ready = false;
  private booting: Promise<boolean> | null = null;

  configured(): boolean {
    return GIS_CLIENT_ID.length > 0;
  }

  preload(): void {
    if (!this.configured()) {
      return;
    }
    void this.ensureReady();
  }

  openSignIn(): void {
    if (!this.configured()) {
      return;
    }
    if (this.ready) {
      openGisSignIn();
      return;
    }
    void this.ensureReady().then((ok) => {
      if (ok) {
        openGisSignIn();
      }
    });
  }

  private ensureReady(): Promise<boolean> {
    if (!this.configured()) {
      return Promise.resolve(false);
    }
    if (this.ready) {
      return Promise.resolve(true);
    }
    if (this.booting) {
      return this.booting;
    }
    this.booting = initGisOneTap(GIS_CLIENT_ID, (profile) => {
      this.session.signIn(profile);
      void this.router.navigateByUrl('/account');
    })
      .then((ok) => {
        this.ready = ok;
        return ok;
      })
      .finally(() => {
        this.booting = null;
      });
    return this.booting;
  }
}
