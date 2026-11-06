import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Api } from './api';
import { Profile, Session } from './session';

/** Requires a token and loads the profile once; a failed load returns to sign-in. */
export const authGuard: CanActivateFn = async () => {
  const session = inject(Session);
  const router = inject(Router);
  const api = inject(Api);
  if (!session.token()) return router.createUrlTree(['/login']);
  if (!session.user()) {
    try {
      session.setProfile(await api.get<Profile>('/auth/me'));
    } catch {
      session.clear();
      return router.createUrlTree(['/login']);
    }
  }
  if (!session.workspace()) return router.createUrlTree(['/login'], { queryParams: { noworkspace: 1 } });
  return true;
};

/** Hides a route the role cannot use (the API still enforces it). */
export const permissionGuard = (...perms: string[]): CanActivateFn => () => {
  const session = inject(Session);
  return perms.some((p) => session.can(p)) ? true : inject(Router).createUrlTree(['/overview']);
};

export const guestGuard: CanActivateFn = () => {
  const session = inject(Session);
  return session.token() ? inject(Router).createUrlTree(['/overview']) : true;
};
