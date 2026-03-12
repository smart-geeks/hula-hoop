import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { StepperModule } from 'primeng/stepper';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { FloatLabelModule } from 'primeng/floatlabel';
import { TextareaModule } from 'primeng/textarea';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { InputMaskModule } from 'primeng/inputmask';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import { PackageService } from '../../../../core/services/package.service';
import { ExtraService } from '../../../../core/services/extra.service';
import { VenueConfigService } from '../../../../core/services/venue-config.service';
import { ReservationService } from '../../../../core/services/reservation.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PaymentService } from '../../../../core/services/payment.service';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';
import type { PartyPackage } from '../../../../core/interfaces/package';
import type { Extra } from '../../../../core/interfaces/extra';
import type { VenueConfig } from '../../../../core/interfaces/venue-config';

interface SelectedExtra {
  extra: Extra;
  quantity: number;
}

@Component({
  selector: 'app-private-reservation-page',
  templateUrl: './private-reservation-page.html',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    StepperModule,
    DatePickerModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    FloatLabelModule,
    TextareaModule,
    TagModule,
    ToastModule,
    InputMaskModule,
    CurrencyMxnPipe,
  ],
  providers: [MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivateReservationPage {
  private readonly timeSlotService = inject(TimeSlotService);
  private readonly packageService = inject(PackageService);
  private readonly extraService = inject(ExtraService);
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
  readonly packages = signal<PartyPackage[]>([]);
  readonly extras = signal<Extra[]>([]);
  readonly venueConfig = signal<VenueConfig | null>(null);

  // ── Step 1: Date + Slot ──
  readonly selectedDate = signal<Date | null>(null);
  readonly selectedSlot = signal<TimeSlot | null>(null);
  readonly checkingAvailability = signal(false);
  readonly availableSlots = signal<TimeSlot[]>([]);

  // ── Step 2: Package ──
  readonly selectedPackage = signal<PartyPackage | null>(null);
  readonly guestCount = signal(1);

  // ── Step 3: Extras ──
  readonly selectedExtras = signal<SelectedExtra[]>([]);

  // ── Computed ──
  readonly minDate = computed(() => {
    const cfg = this.venueConfig();
    const now = new Date();
    const hoursAhead = cfg?.min_hours_before_private ?? 24;
    const min = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
    // If min time already passed today, start from tomorrow
    min.setHours(0, 0, 0, 0);
    if (min.getTime() <= now.getTime()) {
      min.setDate(min.getDate() + 1);
    }
    return min;
  });

  readonly maxDate = computed(() => {
    const cfg = this.venueConfig();
    if (!cfg?.private_booking_horizon_date) return null;
    return new Date(cfg.private_booking_horizon_date + 'T23:59:59');
  });

  readonly slotsForSelectedDate = computed(() => {
    const date = this.selectedDate();
    if (!date) return [];
    const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dayType = isWeekend ? 'weekend' : 'weekday';
    return this.timeSlots().filter((s) => s.day_type === dayType && s.is_active);
  });

  readonly subtotalCents = computed(() => {
    const pkg = this.selectedPackage();
    return pkg?.price_cents ?? 0;
  });

  readonly extrasTotalCents = computed(() => {
    return this.selectedExtras().reduce(
      (sum, se) => sum + se.extra.price_cents * se.quantity,
      0,
    );
  });

  readonly totalCents = computed(() => {
    return this.subtotalCents() + this.extrasTotalCents();
  });

  // ── Step 4: Contact Form ──
  readonly contactForm = this.fb.nonNullable.group({
    guest_name: ['', Validators.required],
    guest_email: ['', [Validators.required, Validators.email]],
    guest_phone: ['', Validators.required],
    notes: [''],
  });

  constructor() {
    this.loadData();
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    const [slots, pkgs, extras, config] = await Promise.all([
      this.timeSlotService.getActiveSlots(),
      this.packageService.getActivePackages(),
      this.extraService.getActiveExtras(),
      this.configService.getConfig(),
    ]);
    this.timeSlots.set(slots);
    this.packages.set(pkgs);
    this.extras.set(extras);
    this.venueConfig.set(config);

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

  // ── Step 1: Date selection ──
  async onDateSelect(date: Date): Promise<void> {
    this.selectedDate.set(date);
    this.selectedSlot.set(null);
    this.availableSlots.set([]);
    this.checkingAvailability.set(true);

    const dateStr = this.formatDateISO(date);
    const slotsForDay = this.slotsForSelectedDate();
    const now = new Date();
    const minHours = this.venueConfig()?.min_hours_before_private ?? 24;
    const cutoff = new Date(now.getTime() + minHours * 60 * 60 * 1000);
    const available: TimeSlot[] = [];

    for (const slot of slotsForDay) {
      // Verify the slot starts at least minHours from now
      const [h, m] = slot.start_time.split(':').map(Number);
      const slotStart = new Date(date);
      slotStart.setHours(h, m, 0, 0);
      if (slotStart < cutoff) continue;

      const blocked = await this.reservationService.isSlotBlockedByPrivate(dateStr, slot.id);
      if (!blocked) {
        available.push(slot);
      }
    }

    this.availableSlots.set(available);
    this.checkingAvailability.set(false);
  }

  selectSlot(slot: TimeSlot): void {
    this.selectedSlot.set(slot);
  }

  // ── Step 2: Package ──
  selectPackage(pkg: PartyPackage): void {
    this.selectedPackage.set(pkg);
    this.guestCount.set(pkg.min_guests);
  }

  updateGuestCount(count: number): void {
    const pkg = this.selectedPackage();
    if (!pkg) return;
    const clamped = Math.max(pkg.min_guests, Math.min(pkg.max_guests, count));
    this.guestCount.set(clamped);
  }

  // ── Step 3: Extras ──
  getExtraQuantity(extra: Extra): number {
    const found = this.selectedExtras().find((se) => se.extra.id === extra.id);
    return found?.quantity ?? 0;
  }

  updateExtraQuantity(extra: Extra, quantity: number): void {
    const current = this.selectedExtras();
    if (quantity <= 0) {
      this.selectedExtras.set(current.filter((se) => se.extra.id !== extra.id));
    } else {
      const existing = current.find((se) => se.extra.id === extra.id);
      if (existing) {
        this.selectedExtras.set(
          current.map((se) => (se.extra.id === extra.id ? { ...se, quantity } : se)),
        );
      } else {
        this.selectedExtras.set([...current, { extra, quantity }]);
      }
    }
  }

  // ── Step navigation ──
  canGoToStep2(): boolean {
    return this.selectedDate() !== null && this.selectedSlot() !== null;
  }

  canGoToStep3(): boolean {
    return this.selectedPackage() !== null;
  }

  canGoToStep4(): boolean {
    return true; // extras are optional
  }

  // ── Step 5: Submit ──
  async submitReservation(): Promise<void> {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      return;
    }

    const date = this.selectedDate();
    const slot = this.selectedSlot();
    const pkg = this.selectedPackage();
    if (!date || !slot || !pkg) return;

    this.submitting.set(true);

    const contact = this.contactForm.getRawValue();
    const user = this.authService.currentUser();

    const reservation = await this.reservationService.createPrivateReservation({
      profile_id: user?.id ?? null,
      guest_name: contact.guest_name,
      guest_email: contact.guest_email,
      guest_phone: contact.guest_phone,
      reservation_date: this.formatDateISO(date),
      time_slot_id: slot.id,
      package_id: pkg.id,
      guest_count: this.guestCount(),
      subtotal_cents: this.subtotalCents(),
      total_cents: this.totalCents(),
      notes: contact.notes || undefined,
      extras: this.selectedExtras().map((se) => ({
        extra_id: se.extra.id,
        quantity: se.quantity,
        unit_price_cents: se.extra.price_cents,
      })),
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

    // Create Mercado Pago payment preference
    const preference = await this.paymentService.createPayment(reservation.id, 'private');

    if (preference) {
      this.paymentService.redirectToCheckout(preference);
    } else {
      // If payment creation fails, still redirect to detail page
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
