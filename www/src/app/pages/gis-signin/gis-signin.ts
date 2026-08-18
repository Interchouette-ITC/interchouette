import { afterNextRender, ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { GisOneTapService } from '../../core/gis-onetap.service';

/** Google OAuth redirect_uri on apex interchouette.net. */
@Component({
  selector: 'app-gis-signin-page',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GisSigninPage {
  constructor() {
    const gis = inject(GisOneTapService);
    afterNextRender(() => {
      gis.completeOauthCallback();
    });
  }
}
