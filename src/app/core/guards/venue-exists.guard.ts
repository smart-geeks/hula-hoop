import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { PublicVenueService } from '../services/public-venue.service';

export const venueExistsGuard: CanActivateFn = async (route: ActivatedRouteSnapshot) => {
  const router      = inject(Router);
  const publicVenue = inject(PublicVenueService);

  const slug  = route.paramMap.get('venue_slug') ?? '';
  const venue = await publicVenue.findBySlug(slug);

  if (!venue) {
    return router.createUrlTree(['/']);
  }

  publicVenue.setActiveVenue(venue);
  return true;
};
