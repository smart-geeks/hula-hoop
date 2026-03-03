import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { StepperModule } from 'primeng/stepper';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { FloatLabelModule } from 'primeng/floatlabel';
import { ToastModule } from 'primeng/toast';
import { InputMaskModule } from 'primeng/inputmask';
import { MessageService } from 'primeng/api';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import { VenueConfigService } from '../../../../core/services/venue-config.service';
import { ReservationService } from '../../../../core/services/reservation.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PaymentService } from '../../../../core/services/payment.service';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';
import type { VenueConfig } from '../../../../core/interfaces/venue-config';

interface SlotAvailability {
  slot: TimeSlot;
  remaining: number;
}

@Component({
  selector: 'app-playdate-reservation-page',
  templateUrl: './playdate-reservation-page.html',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    StepperModule,
    DatePickerModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    FloatLabelModule,
    ToastModule,
    InputMaskModule,
    CurrencyMxnPipe,
  ],
  providers: [MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaydateReservationPage {
  private readonly timeSlotService = inject(TimeSlotService);
  private readonly configService = inject(VenueConfigService);
  private readonly reservationService = inject(ReservationService);
  private readonly authService = inject(AuthService);
  private readonly paymentService = inject(PaymentService);
  private readonly fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);

  // ── State ──
  readonly activeStep = signal(1);
  readonly loading = signal(true);
  readonly submitting = signal(false);

  // ── Data ──
  readonly timeSlots = signal<TimeSlot[]>([]);
  readonly venueConfig = signal<VenueConfig | null>(null);

  // ── Step 1: Date ──
  readonly selectedDate = signal<Date | null>(null);
  readonly checkingAvailability = signal(false);
  readonly availableSlots = signal<SlotAvailability[]>([]);

  // ── Step 2: Slot + persons ──
  readonly selectedSlot = signal<SlotAvailability | null>(null);
  readonly kidsCount = signal(1);
  readonly adultsCount = signal(1);
  readonly extraAdultsCount = signal(0);

  // ── Computed ──
  readonly minDate = computed(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  });

  readonly ticketPriceCents = computed(() => {
    return this.venueConfig()?.playdate_ticket_price_cents ?? 19000;
  });

  readonly extraAdultPriceCents = computed(() => {
    return this.venueConfig()?.playdate_extra_adult_price_cents ?? 6000;
  });

  readonly totalCents = computed(() => {
    const kids = this.kidsCount();
    const baseTickets = kids; // Each kid = 1 ticket (includes 1 adult)
    const extraAdults = this.extraAdultsCount();
    return baseTickets * this.ticketPriceCents() + extraAdults * this.extraAdultPriceCents();
  });

  readonly totalPersons = computed(() => {
    return this.kidsCount() + this.adultsCount() + this.extraAdultsCount();
  });

  // ── Step 3: Contact Form ──
  readonly contactForm = this.fb.nonNullable.group({
    guest_name: ['', Validators.required],
    guest_email: ['', [Validators.required, Validators.email]],
    guest_phone: ['', Validators.required],
  });

  constructor() {
    this.loadData();
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    const [slots, config] = await Promise.all([
      this.timeSlotService.getActiveSlots(),
      this.configService.getConfig(),
    ]);
    this.timeSlots.set(slots);
    this.venueConfig.set(config);

    const profile = this.authService.userProfile();
    if (profile) {
      this.contactForm.patchValue({
        guest_name: profile.full_name ?? '',
        guest_email: profile.email ?? '',
        guest_phone: profile.phone ?? '',
      });
    }
    this.loading.set(false);
  }

  // ── Step 1 ──
  async onDateSelect(date: Date): Promise<void> {
    this.selectedDate.set(date);
    this.selectedSlot.set(null);
    this.availableSlots.set([]);
    this.checkingAvailability.set(true);

    const dateStr = this.formatDateISO(date);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dayType = isWeekend ? 'weekend' : 'weekday';
    const slotsForDay = this.timeSlots().filter((s) => s.day_type === dayType && s.is_active);
    const maxCapacity = this.venueConfig()?.max_capacity_per_slot ?? 50;

    const available: SlotAvailability[] = [];
    for (const slot of slotsForDay) {
      const remaining = await this.reservationService.getPlaydateAvailability(
        dateStr,
        slot.id,
        maxCapacity,
      );
      if (remaining > 0) {
        available.push({ slot, remaining });
      }
    }

    this.availableSlots.set(available);
    this.checkingAvailability.set(false);
  }

  selectSlot(sa: SlotAvailability): void {
    this.selectedSlot.set(sa);
    // Reset person counts
    this.kidsCount.set(1);
    this.adultsCount.set(1);
    this.extraAdultsCount.set(0);
  }

  // ── Step 2: Person counts ──
  updateKidsCount(count: number): void {
    const max = this.selectedSlot()?.remaining ?? 1;
    this.kidsCount.set(Math.max(1, Math.min(count, max)));
    // Adults count = kids count (1 adult per kid included)
    this.adultsCount.set(this.kidsCount());
    // Recalculate max extra adults
    const usedCapacity = this.kidsCount() + this.adultsCount();
    const maxExtra = Math.max(0, (this.selectedSlot()?.remaining ?? 0) - usedCapacity);
    if (this.extraAdultsCount() > maxExtra) {
      this.extraAdultsCount.set(maxExtra);
    }
  }

  updateExtraAdults(count: number): void {
    const usedCapacity = this.kidsCount() + this.adultsCount();
    const maxExtra = Math.max(0, (this.selectedSlot()?.remaining ?? 0) - usedCapacity);
    this.extraAdultsCount.set(Math.max(0, Math.min(count, maxExtra)));
  }

  canGoToStep2(): boolean {
    return this.selectedSlot() !== null;
  }

  canGoToStep3(): boolean {
    return this.kidsCount() >= 1;
  }

  // ── Submit ──
  async submitReservation(): Promise<void> {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }

    const date = this.selectedDate();
    const slotAvail = this.selectedSlot();
    if (!date || !slotAvail) return;

    this.submitting.set(true);

    const contact = this.contactForm.getRawValue();
    const user = this.authService.currentUser();

    const reservation = await this.reservationService.createPlaydateReservation({
      profile_id: user?.id ?? null,
      guest_name: contact.guest_name,
      guest_email: contact.guest_email,
      guest_phone: contact.guest_phone,
      reservation_date: this.formatDateISO(date),
      time_slot_id: slotAvail.slot.id,
      kids_count: this.kidsCount(),
      adults_count: this.adultsCount(),
      extra_adults_count: this.extraAdultsCount(),
      total_cents: this.totalCents(),
    });

    if (!reservation) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error al crear la reserva',
        detail: 'Intenta de nuevo más tarde.',
      });
      this.submitting.set(false);
      return;
    }

    const preference = await this.paymentService.createPayment(reservation.id, 'playdate');

    if (preference) {
      this.paymentService.redirectToCheckout(preference, true);
    } else {
      this.messageService.add({
        severity: 'warn',
        summary: 'Reserva creada',
        detail: 'No se pudo iniciar el pago. Puedes intentar pagar desde el detalle de tu reserva.',
      });
      await this.router.navigate(['/reserva', reservation.access_token]);
    }

    this.submitting.set(false);
  }

  // ── Helpers ──
  formatDateISO(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  formatTime(time: string): string {
    const [h, m] = time.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  }

  formatDateDisplay(date: Date): string {
    return date.toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
