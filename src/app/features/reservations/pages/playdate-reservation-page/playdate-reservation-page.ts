import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { StepperModule } from 'primeng/stepper';
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
import { ReservationService, type AvailablePlaydateSlot } from '../../../../core/services/reservation.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PaymentService } from '../../../../core/services/payment.service';
import type { VenueConfig } from '../../../../core/interfaces/venue-config';

@Component({
  selector: 'app-playdate-reservation-page',
  templateUrl: './playdate-reservation-page.html',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    StepperModule,
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
  readonly venueConfig = signal<VenueConfig | null>(null);
  readonly availableSlots = signal<AvailablePlaydateSlot[]>([]);

  // ── Step 1: Select slot ──
  readonly selectedSlot = signal<AvailablePlaydateSlot | null>(null);

  // ── Step 2: Persons ──
  readonly kidsCount = signal(1);
  readonly adultsCount = signal(1);
  readonly extraAdultsCount = signal(0);

  // ── Computed ──
  readonly ticketPriceCents = computed(() => {
    return this.venueConfig()?.playdate_ticket_price_cents ?? 19000;
  });

  readonly extraAdultPriceCents = computed(() => {
    return this.venueConfig()?.playdate_extra_adult_price_cents ?? 6000;
  });

  readonly totalCents = computed(() => {
    const kids = this.kidsCount();
    const extraAdults = this.extraAdultsCount();
    return kids * this.ticketPriceCents() + extraAdults * this.extraAdultPriceCents();
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

    const [activeSlots, config] = await Promise.all([
      this.timeSlotService.getActiveSlots(),
      this.configService.getConfig(),
    ]);

    this.venueConfig.set(config);
    const maxCapacity = config?.max_capacity_per_slot ?? 50;

    // Get only slots starting within the next 24 hours, not blocked by private
    const available = await this.reservationService.getAvailablePlaydateSlots(activeSlots, maxCapacity);
    this.availableSlots.set(available);

    // Pre-fill contact form if logged in
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
  selectSlot(slot: AvailablePlaydateSlot): void {
    this.selectedSlot.set(slot);
    this.kidsCount.set(1);
    this.adultsCount.set(1);
    this.extraAdultsCount.set(0);
  }

  canGoToStep2(): boolean {
    return this.selectedSlot() !== null;
  }

  // ── Step 2: Person counts ──
  updateKidsCount(count: number): void {
    const max = this.selectedSlot()?.remaining ?? 1;
    this.kidsCount.set(Math.max(1, Math.min(count, max)));
    this.adultsCount.set(this.kidsCount());
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

  canGoToStep3(): boolean {
    return this.kidsCount() >= 1;
  }

  // ── Submit ──
  async submitReservation(): Promise<void> {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }

    const slotData = this.selectedSlot();
    if (!slotData) return;

    this.submitting.set(true);

    const contact = this.contactForm.getRawValue();
    const user = this.authService.currentUser();

    const reservation = await this.reservationService.createPlaydateReservation({
      profile_id: user?.id ?? null,
      guest_name: contact.guest_name,
      guest_email: contact.guest_email,
      guest_phone: contact.guest_phone,
      reservation_date: slotData.date,
      time_slot_id: slotData.slot.id,
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
  formatTime(time: string): string {
    const [h, m] = time.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  }
}
