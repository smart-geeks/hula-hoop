import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AccordionModule } from 'primeng/accordion';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import { VenueConfigService } from '../../../../core/services/venue-config.service';
import { PublicVenueService } from '../../../../core/services/public-venue.service';
import { RestaurantItemService } from '../../../../core/services/restaurant-item.service';
import { ReservationService, type AvailablePlaydateSlot } from '../../../../core/services/reservation.service';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import type { VenueConfig } from '../../../../core/interfaces/venue-config';
import type { RestaurantItem } from '../../../../core/interfaces/restaurant-item';

@Component({
  selector: 'app-play-day-section',
  imports: [ButtonModule, RouterLink, AccordionModule, CurrencyMxnPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './play-day-section.html',
})
export class PlayDaySection {
  private readonly timeSlotService   = inject(TimeSlotService);
  private readonly configService     = inject(VenueConfigService);
  private readonly reservationService = inject(ReservationService);
  private readonly restaurantService = inject(RestaurantItemService);
  readonly publicVenue       = inject(PublicVenueService);

  readonly slots          = signal<AvailablePlaydateSlot[]>([]);
  readonly loading        = signal(true);
  readonly hasAvailability = computed(() => this.slots().length > 0);
  readonly config         = signal<VenueConfig | null>(null);
  readonly menuCategories = signal<{ category: string; items: RestaurantItem[] }[]>([]);

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    const venue = this.publicVenue.activeVenue();
    if (!venue) {
      this.loading.set(false);
      return;
    }
    await Promise.all([
      this.loadAvailableSlots(venue.id),
      this.loadRestaurantMenu(venue.id),
    ]);
  }

  private async loadRestaurantMenu(venueId: string): Promise<void> {
    const items = await this.restaurantService.getActiveItemsByVenue(venueId);

    const map = new Map<string, RestaurantItem[]>();
    for (const item of items) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }

    this.menuCategories.set(
      Array.from(map.entries()).map(([category, catItems]) => ({ category, items: catItems })),
    );
  }

  private async loadAvailableSlots(venueId: string): Promise<void> {
    const [activeSlots, config] = await Promise.all([
      this.timeSlotService.getActiveSlotsByVenue(venueId),
      this.configService.getConfigByVenue(venueId),
    ]);

    this.config.set(config);
    const maxCapacity = config?.max_capacity_per_slot ?? 50;
    const available = await this.reservationService.getAvailablePlaydateSlots(activeSlots, maxCapacity);
    this.slots.set(available);
    this.loading.set(false);
  }

  formatTime(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`;
  }
}
