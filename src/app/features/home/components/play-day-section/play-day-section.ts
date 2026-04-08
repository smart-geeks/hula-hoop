import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AccordionModule } from 'primeng/accordion';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import { VenueConfigService } from '../../../../core/services/venue-config.service';
import { ReservationService, type AvailablePlaydateSlot } from '../../../../core/services/reservation.service';

@Component({
  selector: 'app-play-day-section',
  imports: [ButtonModule, RouterLink, AccordionModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './play-day-section.html',
})
export class PlayDaySection implements OnInit {
  private readonly timeSlotService = inject(TimeSlotService);
  private readonly configService = inject(VenueConfigService);
  private readonly reservationService = inject(ReservationService);

  readonly slots = signal<AvailablePlaydateSlot[]>([]);
  readonly loading = signal(true);
  readonly hasAvailability = computed(() => this.slots().length > 0);

  ngOnInit(): void {
    this.loadAvailableSlots();
  }

  private async loadAvailableSlots(): Promise<void> {
    const [activeSlots, config] = await Promise.all([
      this.timeSlotService.getActiveSlots(),
      this.configService.getConfig(),
    ]);

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
