import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideExperimentalWebMcpTools,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, TitleStrategy } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';

import { AnalyticsService } from './core/analytics.service';
import { LocaleTitleStrategy } from './core/locale-title.strategy';
import { SeoService } from './core/seo.service';
import { siteLocale } from './core/site-locale';
import { createChatInfoWebMcpTools, createChatSendWebMcpTools } from './core/webmcp.chat.tools';
import { createOpenPageWebMcpTools, createSiteInfoWebMcpTools } from './core/webmcp.tools';
import { routes } from './app.routes';

function hydrationProviders() {
  if (typeof location === 'undefined') {
    return [provideClientHydration()];
  }
  return siteLocale() === 'en' ? [provideClientHydration()] : [];
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    { provide: TitleStrategy, useClass: LocaleTitleStrategy },
    ...hydrationProviders(),
    // Homogeneous inputSchema per call (Angular WebMCP typing).
    provideExperimentalWebMcpTools(createSiteInfoWebMcpTools()),
    provideExperimentalWebMcpTools(createOpenPageWebMcpTools()),
    ...(() => {
      const info = createChatInfoWebMcpTools();
      const send = createChatSendWebMcpTools();
      const out = [];
      if (info.length) {
        out.push(provideExperimentalWebMcpTools(info));
      }
      if (send.length) {
        out.push(provideExperimentalWebMcpTools(send));
      }
      return out;
    })(),
    provideAppInitializer(() => {
      inject(SeoService).init();
      inject(AnalyticsService).init();
    }),
  ],
};
