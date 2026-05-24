import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { VenueService } from '../../../../core/services/venue.service';

@Component({
  selector: 'app-venue-switcher',
  templateUrl: './venue-switcher.html',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VenueSwitcher {
  private readonly doc      = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router   = inject(Router);

  readonly venue = inject(VenueService);
  readonly open  = signal(false);

  constructor() {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest('.venue-switcher-root')) {
        this.open.set(false);
      }
    };
    this.doc.addEventListener('click', handler);
    this.destroyRef.onDestroy(() => this.doc.removeEventListener('click', handler));
  }

  toggle(): void {
    this.open.update(v => !v);
  }

  select(venueId: string): void {
    if (venueId === this.venue.currentVenueId()) {
      this.open.set(false);
      return;
    }

    this.venue.switchVenue(venueId);
    this.open.set(false);

    // Forzar que el componente activo se destruya y recree con el nuevo venueId.
    // Navegamos a una ruta intermedia (skipLocationChange = URL no cambia en barra)
    // y volvemos a la URL original — el constructor corre de nuevo y recarga datos.
    const currentUrl = this.router.url;
    const intermediate = currentUrl.includes('/hoy') ? '/admin/configuracion' : '/admin/hoy';

    this.router
      .navigate([intermediate], { skipLocationChange: true })
      .then(() => this.router.navigateByUrl(currentUrl));
  }
}
