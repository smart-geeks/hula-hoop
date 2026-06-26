import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ReservationService } from '../../../../core/services/reservation.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import type { PlaydateReservation } from '../../../../core/interfaces/reservation';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

@Component({
  selector: 'app-playdate-confirmation-page',
  templateUrl: './playdate-confirmation-page.html',
  styleUrl: './playdate-confirmation-page.css',
  imports: [DatePipe, CurrencyPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaydateConfirmationPage {
  private readonly route = inject(ActivatedRoute);
  private readonly reservationService = inject(ReservationService);
  private readonly timeSlotService = inject(TimeSlotService);

  readonly reservation = signal<PlaydateReservation | null>(null);
  readonly timeSlot = signal<TimeSlot | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);

  /** Query param ?status=approved|failure|pending from MP redirect */
  readonly mpStatus = signal<string | null>(null);

  constructor() {
    this.loadReservation();
  }

  private async loadReservation(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    const status = this.route.snapshot.queryParamMap.get('status');
    this.mpStatus.set(status);

    const res = await this.reservationService.getPlaydateReservationByToken(token);
    if (!res) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    this.reservation.set(res);

    if (res.time_slot_id) {
      const slot = await this.timeSlotService.getSlotById(res.time_slot_id);
      this.timeSlot.set(slot);
    }

    this.loading.set(false);
  }

  formatTime(time: string): string {
    const [h, m] = time.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  }

  get isConfirmed(): boolean {
    const status = this.reservation()?.status;
    return status === 'confirmed' || status === 'completed';
  }

  get isPending(): boolean {
    const status = this.reservation()?.status;
    return status === 'pending_payment';
  }

  get isCancelled(): boolean {
    const status = this.reservation()?.status;
    return status === 'cancelled';
  }

  get folio(): string {
    const id = this.reservation()?.id ?? '';
    return 'PD-' + id.replace(/-/g, '').slice(0, 8).toUpperCase();
  }
}
