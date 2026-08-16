import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideExperimentalWebMcpTools,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';

import { AnalyticsService } from './core/analytics.service';
import { SeoService } from './core/seo.service';
import { createOpenPageWebMcpTools, createSiteInfoWebMcpTools } from './core/webmcp.tools';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideClientHydration(),
    // Homogeneous inputSchema per call (Angular WebMCP typing).
    provideExperimentalWebMcpTools(createSiteInfoWebMcpTools()),
    provideExperimentalWebMcpTools(createOpenPageWebMcpTools()),
    provideAppInitializer(() => {
      inject(SeoService).init();
      inject(AnalyticsService).init();
    }),
  ],
};
