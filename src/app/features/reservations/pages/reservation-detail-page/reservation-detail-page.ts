import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { ReservationService } from '../../../../core/services/reservation.service';
import { PaymentService } from '../../../../core/services/payment.service';
import { ReservationPrintService } from '../../../../core/services/reservation-print.service';
import { ContractService } from '../../../../core/services/contract.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import type { PrivateReservation, PlaydateReservation, ReservationStatus } from '../../../../core/interfaces/reservation';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

interface RescueDate {
  date:   string;
  label:  string;
  slotId: string;
  slot:   Pick<TimeSlot, 'start_time' | 'end_time'>;
}

type ReservationType = 'private' | 'playdate' | null;

@Component({
  selector: 'app-reservation-detail-page',
  templateUrl: './reservation-detail-page.html',
  imports: [RouterLink, ButtonModule, TagModule, ToastModule, CurrencyMxnPipe],
  providers: [MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly reservationService = inject(ReservationService);
  private readonly paymentService     = inject(PaymentService);
  private readonly printService       = inject(ReservationPrintService);
  private readonly contractService    = inject(ContractService);
  private readonly timeSlotService    = inject(TimeSlotService);
  private readonly messageService     = inject(MessageService);
  private readonly platformId         = inject(PLATFORM_ID);

  readonly loading          = signal(true);
  readonly notFound         = signal(false);
  readonly reservation      = signal<PrivateReservation | PlaydateReservation | null>(null);
  readonly reservationType  = signal<ReservationType>(null);
  readonly retryingPayment  = signal(false);
  readonly rescueSaving     = signal(false);
  readonly reservationExtras = signal<{ name: string; quantity: number; unit_price_cents: number; pay_at_venue: boolean }[]>([]);
  readonly snackOptionName  = signal<string | null>(null);

  /** Set when the reserved slot is now taken by another contract — shows rescue UI. */
  readonly slotConflict = signal<{
    originalDate:   string;
    originalSlot:   string;
    availableDates: RescueDate[];
  } | null>(null);

  /** Query param from MP redirect */
  readonly paymentStatus = signal<string | null>(null);

  readonly statusConfig = computed(() => {
    const status = this.reservation()?.status;
    return this.getStatusConfig(status ?? 'pending_payment');
  });

  constructor() {
    this.loadReservation();
  }

  private async loadReservation(): Promise<void> {
    const accessToken = this.route.snapshot.paramMap.get('accessToken');
    if (!accessToken) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    // Check query params from MP redirect
    const queryStatus = this.route.snapshot.queryParamMap.get('status');
    if (queryStatus) {
      this.paymentStatus.set(queryStatus);
      if (queryStatus === 'approved') {
        this.launchConfetti();
      }
    }

    // Try private first, then playdate
    const privateRes = await this.reservationService.getPrivateReservationByToken(accessToken);
    if (privateRes) {
      this.reservation.set(privateRes);
      this.reservationType.set('private');
      const extras = await this.reservationService.getPrivateReservationExtras(privateRes.id);
      this.reservationExtras.set(extras);
      if (privateRes.snack_option_id) {
        const name = await this.reservationService.getSnackOptionName(privateRes.snack_option_id);
        this.snackOptionName.set(name);
      }
      this.loading.set(false);
      return;
    }

    const playdateRes = await this.reservationService.getPlaydateReservationByToken(accessToken);
    if (playdateRes) {
      this.reservation.set(playdateRes);
      this.reservationType.set('playdate');
      this.loading.set(false);
      return;
    }

    this.notFound.set(true);
    this.loading.set(false);
  }

  async retryPayment(): Promise<void> {
    const res = this.reservation();
    const type = this.reservationType();
    if (!res || !type || this.retryingPayment() || this.rescueSaving()) return;

    // For pending private reservations, verify the slot is still free
    if (type === 'private' && this.isPrivateReservation(res) && res.status === 'pending_payment') {
      this.retryingPayment.set(true);
      const slots = await this.timeSlotService.getActiveSlotsByVenue(res.venue_id);
      const currentSlot = slots.find((s) => s.id === res.time_slot_id);

      if (currentSlot) {
        const hasConflict = await this.contractService.checkSlotConflict(
          res.venue_id, res.reservation_date, currentSlot.start_time, currentSlot.end_time,
        );
        if (hasConflict) {
          const availableDates = await this.buildRescueDates(res.venue_id, currentSlot, slots);
          this.slotConflict.set({
            originalDate: res.reservation_date,
            originalSlot: currentSlot.start_time + (currentSlot.end_time ? ` – ${currentSlot.end_time}` : ''),
            availableDates,
          });
          this.retryingPayment.set(false);
          return;
        }
      }
    } else {
      this.retryingPayment.set(true);
    }

    const preference = await this.paymentService.createPayment(res.id, type);
    if (preference) {
      this.paymentService.redirectToCheckout(preference);
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo iniciar el proceso de pago.',
      });
    }
    this.retryingPayment.set(false);
  }

  /** Called from the rescue card — reschedules the reservation to alt.date and redirects to MP. */
  async rescheduleAndPay(alt: RescueDate): Promise<void> {
    const res = this.reservation();
    const type = this.reservationType();
    if (!res || !type || this.rescueSaving() || !this.isPrivateReservation(res)) return;
    this.rescueSaving.set(true);

    const ok = await this.reservationService.reschedulePrivateReservation(res.id, alt.date, alt.slotId);
    if (!ok) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo reprogramar la reserva.' });
      this.rescueSaving.set(false);
      return;
    }

    // Update local reservation date so the UI reflects the change
    this.reservation.update((r) => r ? { ...r, reservation_date: alt.date, time_slot_id: alt.slotId } : r);
    this.slotConflict.set(null);

    const preference = await this.paymentService.createPayment(res.id, type);
    if (preference) {
      this.paymentService.redirectToCheckout(preference);
    } else {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo generar el pago.' });
    }
    this.rescueSaving.set(false);
  }

  private async buildRescueDates(venueId: string, currentSlot: TimeSlot, allSlots: TimeSlot[]): Promise<RescueDate[]> {
    const today  = new Date();
    const toDate = new Date(today.getTime() + 90 * 86400000);
    const from   = today.toISOString().split('T')[0];
    const to     = toDate.toISOString().split('T')[0];

    const booked = await this.contractService.getBookedDates(venueId, from, to, currentSlot.start_time);
    const bookedSet = new Set(booked.map((b) => b.fecha));

    const results: RescueDate[] = [];
    const cursor = new Date(today.getTime() + 86400000);

    while (results.length < 6 && cursor <= toDate) {
      const iso    = cursor.toISOString().split('T')[0];
      const dow    = cursor.getDay();
      const dayType: 'weekday' | 'weekend' = (dow === 0 || dow === 6) ? 'weekend' : 'weekday';

      // Find the slot for this day type with the same start_time
      const matchingSlot = allSlots.find(
        (s) => s.start_time === currentSlot.start_time && s.day_type === dayType,
      ) ?? (currentSlot.day_type === dayType ? currentSlot : undefined);

      if (matchingSlot && !bookedSet.has(iso)) {
        results.push({
          date:   iso,
          label:  cursor.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }),
          slotId: matchingSlot.id,
          slot:   { start_time: matchingSlot.start_time, end_time: matchingSlot.end_time },
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return results;
  }

  isPrivateReservation(res: PrivateReservation | PlaydateReservation): res is PrivateReservation {
    return 'package_id' in res;
  }

  formatTime(time: string): string {
    const [h, m] = time.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  getLiquidationDateString(res: PrivateReservation): string | null {
    const days = res.packages?.days_to_liquidate;
    if (!days) return null;
    const d = new Date(res.reservation_date + 'T12:00:00');
    d.setDate(d.getDate() - days);
    return d.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  // ── Print / Share ─────────────────────────────────────────
  printPdf(): void {
    const res = this.reservation();
    const type = this.reservationType();
    if (!res || !type) return;
    this.printService.print(this.buildPrintData(res, type));
  }

  shareWhatsApp(): void {
    const res = this.reservation();
    const type = this.reservationType();
    if (!res || !type) return;
    window.open(this.printService.getWhatsAppUrl(this.buildPrintData(res, type), false), '_blank');
  }

  private buildPrintData(
    res: PrivateReservation | PlaydateReservation,
    type: 'private' | 'playdate',
  ) {
    const isPrivate = this.isPrivateReservation(res);
    const timeLabel = isPrivate || 'time_slot_id' in res
      ? '' // time_slot_label will be filled below
      : '';

    let guest_count_label = '';
    let snack_name: string | null = null;
    let notes: string | null = null;
    let subtotal_cents = res.total_cents;
    let liquidation_date: string | null = null;

    if (isPrivate) {
      guest_count_label = `${res.guest_count} invitados`;
      snack_name = this.snackOptionName();
      notes = res.notes;
      subtotal_cents = res.subtotal_cents;
      liquidation_date = this.getLiquidationDateString(res);
    } else {
      const p = res as PlaydateReservation;
      guest_count_label = `${p.kids_count} niño(s), ${p.adults_count + p.extra_adults_count} adulto(s)`;
    }

    return {
      type,
      statusLabel: this.statusConfig().label,
      guest_name: res.guest_name,
      guest_email: res.guest_email,
      guest_phone: res.guest_phone,
      reservation_date: this.formatDate(res.reservation_date),
      time_slot_label: '', // not available in client view without extra query
      guest_count_label,
      snack_name,
      notes,
      extras: isPrivate ? this.reservationExtras() : [],
      subtotal_cents,
      total_cents: res.total_cents,
      paid_deposit_cents: res.paid_deposit_cents ?? 0,
      liquidation_date,
      access_token: res.access_token,
    };
  }

  private async launchConfetti(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const confetti = (await import('canvas-confetti')).default;

    // First burst from the left
    confetti({ particleCount: 80, spread: 70, origin: { x: 0.15, y: 0.6 } });
    // First burst from the right
    confetti({ particleCount: 80, spread: 70, origin: { x: 0.85, y: 0.6 } });

    // Second wave after a short delay
    setTimeout(() => {
      confetti({ particleCount: 50, spread: 100, origin: { x: 0.5, y: 0.4 } });
    }, 300);
  }

  getStatusConfig(status: ReservationStatus): { label: string; severity: string } {
    switch (status) {
      case 'pending_payment':
        return { label: 'Pendiente de pago', severity: 'warn' };
      case 'confirmed':
        return { label: 'Confirmada', severity: 'success' };
      case 'completed':
        return { label: 'Completada', severity: 'info' };
      case 'cancelled':
        return { label: 'Cancelada', severity: 'danger' };
      case 'expired':
        return { label: 'Expirada', severity: 'secondary' };
      default:
        return { label: status, severity: 'info' };
    }
  }
}
