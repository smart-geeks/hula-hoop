import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PublicVenueService } from '../../../../core/services/public-venue.service';
import type { Venue } from '../../../../core/interfaces/venue';

@Component({
  selector: 'app-venue-selector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './venue-selector.html',
})
export class VenueSelectorPage {
  private readonly router      = inject(Router);
  private readonly publicVenue = inject(PublicVenueService);

  readonly venues  = this.publicVenue.venues;
  readonly loading = signal(true);

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    await this.publicVenue.loadPublicVenues();
    const list = this.publicVenue.venues();
    // Si solo hay una sucursal activa, redirigir directamente sin mostrar selector
    if (list.length === 1) {
      this.publicVenue.setActiveVenue(list[0]);
      this.router.navigate(['/', list[0].slug]);
      return;
    }
    this.loading.set(false);
  }

  selectVenue(venue: Venue): void {
    this.publicVenue.setActiveVenue(venue);
    this.router.navigate(['/', venue.slug]);
  }
}
