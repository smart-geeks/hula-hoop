import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';

const COOKIE_KEY = 'hh_preferred_venue';

export const rootRedirectGuard: CanActivateFn = () => {
  const router     = inject(Router);
  const platformId = inject(PLATFORM_ID);

  const slug = isPlatformBrowser(platformId)
    ? readCookieBrowser(COOKIE_KEY)
    : null; // En SSR sin cookie → mostrar selector

  if (slug) {
    return router.createUrlTree(['/', slug]);
  }
  return true; // Mostrar VenueSelectorPage
};

function readCookieBrowser(key: string): string | null {
  try {
    const match = document.cookie
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith(`${key}=`));
    return match ? decodeURIComponent(match.split('=')[1]) : null;
  } catch {
    return null;
  }
}
