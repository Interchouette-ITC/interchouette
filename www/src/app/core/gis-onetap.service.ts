import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

import { CustomerSession } from './customer-session';
import { GIS_CLIENT_ID } from './gis.constants';
import {
  GIS_NONCE_KEY,
  decodeGisState,
  gisAuthorizeUrl,
  hashParams,
  isAllowedReturnHref,
  jwtNonce,
  parseGisReturnHash,
  usesLocalGisPicker,
  withGisReturnHash,
} from './gis-oauth';
import { initGisOneTap, openGisSignIn, profileFromGisJwt } from './gis-signin';
import { SITE_ORIGIN } from './seo.constants';

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
    this.consumeReturnHash();
    if (!this.configured() || typeof location === 'undefined') {
      return;
    }
    if (usesLocalGisPicker(location.hostname)) {
      void this.ensureReady();
    }
  }

  openSignIn(): void {
    if (!this.configured() || typeof location === 'undefined') {
      return;
    }
    if (usesLocalGisPicker(location.hostname)) {
      this.openLocalPicker();
      return;
    }
    const nonce = crypto.randomUUID();
    sessionStorage.setItem(GIS_NONCE_KEY, nonce);
    location.assign(gisAuthorizeUrl(GIS_CLIENT_ID, location.href, nonce));
  }

  /** Apex .net landing after Google. Send locale TLDs back; stay on .net for .net. */
  completeOauthCallback(): void {
    if (typeof location === 'undefined') {
      return;
    }
    const query = new URLSearchParams(
      location.search.startsWith('?') ? location.search.slice(1) : location.search,
    );
    const fragment = hashParams(location.hash);
    if (!fragment.get('id_token') && !query.get('error') && !fragment.get('error')) {
      return;
    }
    const state = decodeGisState(fragment.get('state') ?? query.get('state'));
    if (query.get('error') || fragment.get('error')) {
      this.leaveCallback(state?.returnHref);
      return;
    }
    const idToken = fragment.get('id_token');
    const profile = idToken ? profileFromGisJwt(idToken) : null;
    if (!idToken || !profile || !state || jwtNonce(idToken) !== state.nonce) {
      this.leaveCallback(state?.returnHref);
      return;
    }
    const returnUrl = new URL(state.returnHref);
    if (returnUrl.origin === SITE_ORIGIN) {
      this.session.signIn(profile);
      history.replaceState({}, '', '/account');
      void this.router.navigateByUrl('/account');
      return;
    }
    location.replace(withGisReturnHash(state.returnHref, profile, state.nonce));
  }

  private leaveCallback(returnHref: string | undefined): void {
    if (returnHref && isAllowedReturnHref(returnHref)) {
      location.replace(returnHref);
      return;
    }
    void this.router.navigateByUrl('/');
  }

  private consumeReturnHash(): void {
    if (typeof location === 'undefined' || typeof sessionStorage === 'undefined') {
      return;
    }
    const profile = parseGisReturnHash(location.hash, sessionStorage.getItem(GIS_NONCE_KEY));
    if (!profile) {
      return;
    }
    sessionStorage.removeItem(GIS_NONCE_KEY);
    history.replaceState({}, '', `${location.pathname}${location.search}`);
    this.session.signIn(profile);
    void this.router.navigateByUrl('/account');
  }

  private openLocalPicker(): void {
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
