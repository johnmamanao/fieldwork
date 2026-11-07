import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { ViewportScroller } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { PageMeta } from './core/page-meta';
import { routes } from './app.routes';
import { apiInterceptor } from './core/api';

/**
 * Page transitions are decoration and must never hold up navigation. A transition waits for the browser
 * to paint a frame; in a background tab, a hidden window or a busy machine that frame can be late or never
 * come, and every later navigation would queue behind it (a logo click that "does nothing"). So: no
 * transition under reduced motion or when the page is not visible, and any transition still running after
 * a short limit is skipped.
 */
function guardTransition({ transition }: { transition: { skipTransition(): void; finished: Promise<void>; ready: Promise<void> } }): void {
  // A skipped transition rejects `ready` with an AbortError; that is expected, not an error.
  transition.ready.catch(() => undefined);
  // Reduced motion is handled in styles.css (the transition runs with no animation); only a hidden page skips.
  if (document.visibilityState !== 'visible') {
    transition.skipTransition();
    return;
  }
  const limit = setTimeout(() => transition.skipTransition(), 700);
  transition.finished.finally(() => clearTimeout(limit));
}

export const appConfig: ApplicationConfig = {
  providers: [
    // Links to a section (/#analytics) land below the landing page's fixed 80px navigation bar.
    provideAppInitializer(() => inject(ViewportScroller).setOffset([0, 80])),
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([apiInterceptor])),
    { provide: TitleStrategy, useClass: PageMeta },
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }), withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated: guardTransition })),
  ],
};
