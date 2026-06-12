import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { PackageService } from '../../../../core/services/package.service';
import { PublicVenueService } from '../../../../core/services/public-venue.service';
import { PACKAGE_COLORS } from '../../../../core/interfaces/package';
import type { PartyPackage } from '../../../../core/interfaces/package';

@Component({
  selector: 'app-private-events-section',
  imports: [RouterLink, CurrencyMxnPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './private-events-section.html',
})
export class PrivateEventsSection {
  private readonly packageService = inject(PackageService);
  readonly publicVenue            = inject(PublicVenueService);

  readonly packages = signal<PartyPackage[]>([]);

  readonly inclusions = [
    'Merienda', 'Bebida Refill', 'Host',
    'Actividades', 'Vajilla', 'Asistentes Playground',
    'Piñata', 'Evento de 3 Horas',
  ];

  constructor() {
    this.loadPackages();
  }

  private async loadPackages(): Promise<void> {
    const venue = this.publicVenue.activeVenue();
    if (!venue) return;
    const data = await this.packageService.getActivePackagesByVenue(venue.id);
    this.packages.set(data);
  }

  getColorHex(pkg: PartyPackage): string {
    const found = PACKAGE_COLORS.find(c => c.value === pkg.color);
    return found?.hex ?? '#FC7632';
  }
}
