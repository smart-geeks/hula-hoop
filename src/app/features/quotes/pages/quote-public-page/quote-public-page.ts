import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { QuoteService } from '../../../../core/services/quote.service';
import { VenueService } from '../../../../core/services/venue.service';
import { ReservationService } from '../../../../core/services/reservation.service';
import { PaymentService } from '../../../../core/services/payment.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import { PackageService } from '../../../../core/services/package.service';
import { ExtraService } from '../../../../core/services/extra.service';
import { SnackOptionService } from '../../../../core/services/snack-option.service';
import { ContractService } from '../../../../core/services/contract.service';
import type { Quote } from '../../../../core/interfaces/quote';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

export interface AvailableDate {
  date:    string;   // YYYY-MM-DD
  label:   string;   // formatted for display
  dayType: 'weekday' | 'weekend';
  slot:    Pick<TimeSlot, 'start_time' | 'end_time'>;
}

@Component({
  selector: 'app-quote-public-page',
  templateUrl: './quote-public-page.html',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuotePublicPage {
  private readonly quoteService  = inject(QuoteService);
  private readonly venueService  = inject(VenueService);
  private readonly route         = inject(ActivatedRoute);
  private readonly router        = inject(Router);

  private readonly reservationService = inject(ReservationService);
  private readonly paymentService     = inject(PaymentService);
  private readonly timeSlotService    = inject(TimeSlotService);
  private readonly packageService     = inject(PackageService);
  private readonly extraService       = inject(ExtraService);
  private readonly snackOptionService = inject(SnackOptionService);
  private readonly contractService    = inject(ContractService);

  readonly loading      = signal(true);
  readonly notFound     = signal(false);
  readonly quote        = signal<Quote | null>(null);
  readonly venueSlug    = signal<string | null>(null);
  readonly submitting   = signal(false);
  readonly rescueSaving = signal(false);

  /** Set when the slot is taken — shows the rescue UI with alternative dates. */
  readonly slotConflict = signal<{
    originalDate:   string;
    originalSlot:   string;
    availableDates: AvailableDate[];
  } | null>(null);

  constructor() {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.notFound.set(true);
      this.loading.set(false);
    } else {
      this.loadQuote(token);
    }
  }

  private async loadQuote(token: string): Promise<void> {
    const q = await this.quoteService.getByPublicToken(token);
    if (!q) {
      this.notFound.set(true);
    } else {
      this.quote.set(q);
      const venue = await this.venueService.getVenueById(q.venue_id);
      this.venueSlug.set(venue?.slug ?? null);
    }
    this.loading.set(false);
  }

  async approveAndPay(overrideDate?: string): Promise<void> {
    const q = this.quote();
    const slug = this.venueSlug();
    if (!q || !slug || this.submitting() || this.rescueSaving()) return;

    const targetDate = overrideDate ?? q.fecha_evento ?? '';
    if (overrideDate) {
      this.rescueSaving.set(true);
    } else {
      this.submitting.set(true);
    }

    try {
      // ── Conflict check (skip if re-using an existing reservation) ──────────
      const existingReservation = await this.reservationService.getPrivateReservationByQuoteId(q.id);

      if (!existingReservation && q.hora_inicio && targetDate) {
        const conflict = await this.contractService.checkSlotConflict(
          q.venue_id, targetDate, q.hora_inicio, q.hora_fin ?? undefined,
        );
        if (conflict) {
          const availableDates = await this.buildAvailableDates(q.venue_id, q.hora_inicio);
          this.slotConflict.set({
            originalDate: targetDate,
            originalSlot: q.hora_inicio + (q.hora_fin ? ` – ${q.hora_fin}` : ''),
            availableDates,
          });
          this.submitting.set(false);
          this.rescueSaving.set(false);
          return;
        }
      }

      // ── Create or reuse reservation ────────────────────────────────────────
      let reservation = existingReservation;

      if (!reservation) {
        const [slots, pkgs, extras, snacks] = await Promise.all([
          this.timeSlotService.getActiveSlotsByVenue(q.venue_id),
          this.packageService.getActivePackagesByVenue(q.venue_id),
          this.extraService.getActiveExtrasByVenue(q.venue_id),
          this.snackOptionService.getActiveSnackOptions(),
        ]);

        const slotMatch = slots.find((s) => s.start_time === q.hora_inicio) || slots[0];
        if (!slotMatch) throw new Error('No se encontró un horario disponible para esta cotización.');

        const pkgMatch = pkgs.find((p) =>
          q.items?.some((it) => it.descripcion.toLowerCase() === p.name.toLowerCase()),
        ) || pkgs[0];
        if (!pkgMatch) throw new Error('No se encontró el paquete asociado a esta cotización.');

        const snackMatch = snacks.find((s) =>
          q.items?.some((it) => it.descripcion.toLowerCase().includes(s.name.toLowerCase())),
        );

        const selectedExtras: Array<{ extra_id: string; quantity: number; unit_price_cents: number }> = [];
        if (q.items) {
          for (const it of q.items) {
            const matchedExtra = extras.find((e) => e.name.toLowerCase() === it.descripcion.toLowerCase());
            if (matchedExtra) {
              selectedExtras.push({
                extra_id: matchedExtra.id,
                quantity: Number(it.cantidad),
                unit_price_cents: matchedExtra.price_cents,
              });
            }
          }
        }

        reservation = await this.reservationService.createPrivateReservation({
          venue_id:         q.venue_id,
          profile_id:       null,
          guest_name:       q.client?.nombre || 'Invitado',
          guest_email:      q.client?.email || '',
          guest_phone:      q.client?.telefono || '',
          reservation_date: targetDate,
          time_slot_id:     slotMatch.id,
          package_id:       pkgMatch.id,
          guest_count:      q.guest_count || 10,
          subtotal_cents:   Math.round(Number(q.subtotal) * 100),
          total_cents:      Math.round(Number(q.total) * 100),
          deposit_cents:    Math.round(Number(q.deposit_amount || q.total) * 100),
          notes:            q.notas || undefined,
          snack_option_id:  snackMatch?.id,
          quote_id:         q.id,
          extras:           selectedExtras,
        });
      }

      if (!reservation) throw new Error('Error al generar la reservación.');

      const preference = await this.paymentService.createPayment(reservation.id, 'private');
      if (preference) {
        this.paymentService.redirectToCheckout(preference);
      } else {
        throw new Error('No se pudo generar la preferencia de pago.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la cotización. Intenta de nuevo.';
      console.error('Error approving quote:', err);
      alert(msg);
      this.submitting.set(false);
      this.rescueSaving.set(false);
    }
  }

  /** Called from rescue UI — books a specific alternative date. */
  async bookAlternativeDate(alt: AvailableDate): Promise<void> {
    this.slotConflict.set(null);
    await this.approveAndPay(alt.date);
  }

  /** Computes next available dates (same slot) for the rescue UI. */
  private async buildAvailableDates(venueId: string, horaInicio: string): Promise<AvailableDate[]> {
    const today   = new Date();
    const toDate  = new Date(today.getTime() + 90 * 86400000);
    const from    = today.toISOString().split('T')[0];
    const to      = toDate.toISOString().split('T')[0];

    const [booked, slots] = await Promise.all([
      this.contractService.getBookedDates(venueId, from, to, horaInicio),
      this.timeSlotService.getActiveSlotsByVenue(venueId),
    ]);

    const bookedSet  = new Set(booked.map((b) => b.fecha));
    const targetSlot = slots.find((s) => s.start_time === horaInicio) ?? slots[0];
    if (!targetSlot) return [];

    const results: AvailableDate[] = [];
    const cursor = new Date(today.getTime() + 86400000); // start from tomorrow

    while (results.length < 6 && cursor <= toDate) {
      const iso      = cursor.toISOString().split('T')[0];
      const dow      = cursor.getDay();
      const dayType: 'weekday' | 'weekend' = (dow === 0 || dow === 6) ? 'weekend' : 'weekday';

      if (targetSlot.day_type === dayType && !bookedSet.has(iso)) {
        results.push({
          date:    iso,
          label:   cursor.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }),
          dayType,
          slot:    { start_time: targetSlot.start_time, end_time: targetSlot.end_time },
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return results;
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  printPdf(): void {
    window.print();
  }
}
