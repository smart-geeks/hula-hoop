import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecorationLevelService } from '../../../../core/services/decoration-level.service';
import { PublicVenueService } from '../../../../core/services/public-venue.service';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import type { DecorationLevel } from '../../../../core/interfaces/decoration-level';

@Component({
  selector: 'app-decoration-packages-section',
  templateUrl: './decoration-packages-section.html',
  imports: [CurrencyMxnPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecorationPackagesSection {
  private readonly decorationLevelService = inject(DecorationLevelService);
  private readonly publicVenue = inject(PublicVenueService);

  readonly levels = signal<DecorationLevel[]>([]);

  constructor() {
    this.loadLevels();
  }

  private async loadLevels(): Promise<void> {
    const venue = this.publicVenue.activeVenue();
    if (!venue) return;
    const data = await this.decorationLevelService.getActiveByVenue(venue.id);
    this.levels.set(data);
  }
}
