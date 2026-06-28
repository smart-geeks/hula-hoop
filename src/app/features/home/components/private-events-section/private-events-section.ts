import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { PackageService } from '../../../../core/services/package.service';
import { PublicVenueService } from '../../../../core/services/public-venue.service';
import { PackageCategoryConfigService } from '../../../../core/services/package-category-config.service';
import { PACKAGE_COLORS } from '../../../../core/interfaces/package';
import type { PartyPackage } from '../../../../core/interfaces/package';
import type { PackageCategoryConfig } from '../../../../core/interfaces/package-category-config';

@Component({
  selector: 'app-private-events-section',
  imports: [RouterLink, CurrencyMxnPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './private-events-section.html',
})
export class PrivateEventsSection {
  private readonly packageService = inject(PackageService);
  private readonly categoryConfigService = inject(PackageCategoryConfigService);
  readonly publicVenue            = inject(PublicVenueService);

  readonly packages = signal<PartyPackage[]>([]);
  readonly categoryConfigs = signal<PackageCategoryConfig[]>([]);
  readonly selectedCategory = signal<'hula_hula' | 'hooping'>('hula_hula');

  readonly filteredPackages = computed(() =>
    this.packages().filter((pkg) => pkg.category === this.selectedCategory())
  );

  readonly activeCategoryConfig = computed(() =>
    this.categoryConfigs().find((cfg) => cfg.category === this.selectedCategory())
  );

  constructor() {
    this.loadData();
  }

  private async loadData(): Promise<void> {
    const venue = this.publicVenue.activeVenue();
    if (!venue) return;

    const [pkgs, configs] = await Promise.all([
      this.packageService.getActivePackagesByVenue(venue.id),
      this.categoryConfigService.getConfigsByVenue(venue.id),
    ]);

    this.packages.set(pkgs);
    this.categoryConfigs.set(configs);
  }

  getColorHex(pkg: PartyPackage): string {
    const found = PACKAGE_COLORS.find(c => c.value === pkg.color);
    return found?.hex ?? '#FC7632';
  }
}
