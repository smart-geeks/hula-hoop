import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.awaitReady();

  const role = auth.userProfile()?.role;
  const hasAccess = role === 'owner' || role === 'admin' || role === 'staff';

  if (hasAccess) {
    return true;
  }

  return router.createUrlTree(['/']);
};
