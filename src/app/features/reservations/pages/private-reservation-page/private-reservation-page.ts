import { ChangeDetectionStrategy, Component, computed, inject, signal, effect } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ReservationPrintService, ReservationPrintData } from '../../../../core/services/reservation-print.service';
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
import { SnackOptionService } from '../../../../core/services/snack-option.service';
import { VenueConfigService } from '../../../../core/services/venue-config.service';
import { ReservationService } from '../../../../core/services/reservation.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PaymentService } from '../../../../core/services/payment.service';
import { PublicVenueService } from '../../../../core/services/public-venue.service';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';
import type { PartyPackage } from '../../../../core/interfaces/package';
import type { Extra } from '../../../../core/interfaces/extra';
import type { SnackOption } from '../../../../core/interfaces/snack-option';
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
  private readonly snackOptionService = inject(SnackOptionService);
  private readonly configService = inject(VenueConfigService);
  private readonly reservationService = inject(ReservationService);
  private readonly authService = inject(AuthService);
  private readonly paymentService = inject(PaymentService);
  private readonly publicVenue = inject(PublicVenueService);
  private readonly fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);
  private readonly printService = inject(ReservationPrintService);

  // ── State ──
  readonly activeStep     = signal(1);
  readonly linkedQuoteId  = signal<string | null>(null);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly lastGeneratedReservation = signal<any | null>(null);
  readonly generatedQuoteToken = signal<string | null>(null);
  readonly generatingQuote = signal(false);

  // ── Data ──
  readonly timeSlots = signal<TimeSlot[]>([]);
  readonly packages = signal<PartyPackage[]>([]);
  readonly extras = signal<Extra[]>([]);
  readonly snackOptions = signal<SnackOption[]>([]);
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

  // ── Step 4: Merienda ──
  readonly selectedSnackOption = signal<SnackOption | null>(null);

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
      (sum, se) => sum + (se.extra.pay_at_venue ? 0 : se.extra.price_cents * se.quantity),
      0,
    );
  });

  readonly totalCents = computed(() => {
    return this.subtotalCents() + this.extrasTotalCents();
  });

  readonly depositCents = computed(() => {
    const pkg = this.selectedPackage();
    const total = this.totalCents();
    if (!pkg || pkg.deposit_type === 'full') return total;
    if (pkg.deposit_type === 'percentage') {
      return Math.round(total * pkg.deposit_value / 100);
    }
    // fixed: deposit_value is in cents, cap at total
    return Math.min(pkg.deposit_value, total);
  });

  readonly remainingCents = computed(() => {
    return this.totalCents() - this.depositCents();
  });

  readonly hasPartialDeposit = computed(() => {
    return this.depositCents() < this.totalCents();
  });

  // ── Step 4: Contact Form ──
  readonly contactForm = this.fb.nonNullable.group({
    guest_name: ['', Validators.required],
    guest_email: ['', [Validators.required, Validators.email]],
    guest_phone: ['', Validators.required],
    notes: [''],
  });

  readonly isAdmin = computed(() => this.authService.isAdmin());

  constructor() {
    const quoteId = this.route.snapshot.queryParamMap.get('quote_id');
    this.linkedQuoteId.set(quoteId);
    this.loadData();

    this.contactForm.valueChanges.subscribe(() => {
      this.generatedQuoteToken.set(null);
      this.lastGeneratedReservation.set(null);
    });

    effect(() => {
      this.selectedDate();
      this.selectedSlot();
      this.selectedPackage();
      this.guestCount();
      this.selectedExtras();
      this.selectedSnackOption();
      this.lastGeneratedReservation.set(null);
      this.generatedQuoteToken.set(null);
    }, { allowSignalWrites: true });
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    const venue = this.publicVenue.activeVenue();

    let slots: TimeSlot[] = [];
    let pkgs: PartyPackage[] = [];
    let extras: Extra[] = [];
    let config: VenueConfig | null = null;

    if (venue) {
      const [s, p, e, c] = await Promise.all([
        this.timeSlotService.getActiveSlotsByVenue(venue.id),
        this.packageService.getActivePackagesByVenue(venue.id),
        this.extraService.getActiveExtrasByVenue(venue.id),
        this.configService.getConfigByVenue(venue.id),
      ]);
      slots = s;
      pkgs = p;
      extras = e;
      config = c;
    } else {
      const [s, p, e, c] = await Promise.all([
        this.timeSlotService.getActiveSlots(),
        this.packageService.getActivePackages(),
        this.extraService.getActiveExtras(),
        this.configService.getConfig(),
      ]);
      slots = s;
      pkgs = p;
      extras = e;
      config = c;
    }

    const snacks = await this.snackOptionService.getActiveSnackOptions();

    this.timeSlots.set(slots);
    this.packages.set(pkgs);
    this.extras.set(extras);
    this.snackOptions.set(snacks);
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
    this.guestCount.set(pkg.max_guests);

    // Auto-scroll a la sección de merienda que se acaba de habilitar
    setTimeout(() => {
      document.getElementById('merienda-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
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

  toggleExtra(extra: Extra): void {
    const current = this.selectedExtras();
    const exists = current.find((se) => se.extra.id === extra.id);
    if (exists) {
      this.selectedExtras.set(current.filter((se) => se.extra.id !== extra.id));
    } else {
      this.selectedExtras.set([...current, { extra, quantity: 1 }]);
    }
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

  // ── Step 4: Merienda ──
  selectSnackOption(option: SnackOption): void {
    this.selectedSnackOption.set(option);
  }

  // ── Step navigation ──
  // ── Step navigation ──
  canGoToStep2(): boolean {
    return this.selectedDate() !== null && this.selectedSlot() !== null;
  }

  canGoToStep3(): boolean {
    return this.selectedPackage() !== null && (this.snackOptions().length === 0 || this.selectedSnackOption() !== null);
  }

  canGoToStep4(): boolean {
    return true; // extras are optional
  }

  onStepChange(step: number | undefined): void {
    if (step === undefined) return;
    const current = this.activeStep();
    if (step > current) {
      if (step >= 2 && !this.canGoToStep2()) {
        this.navigateToStepWithWarning(
          1,
          'Debes seleccionar una fecha y un horario disponible primero. Estos campos son necesarios para generar tu cotización.',
          '#date-selection-header'
        );
        return;
      }
      if (step >= 3 && !this.canGoToStep3()) {
        if (!this.canGoToStep2()) {
          this.navigateToStepWithWarning(
            1,
            'Debes seleccionar una fecha y un horario disponible primero. Estos campos son necesarios para generar tu cotización.',
            '#date-selection-header'
          );
          return;
        }
        this.navigateToStepWithWarning(
          2,
          'Debes seleccionar un paquete y su merienda primero. Estos campos son necesarios para generar tu cotización.',
          '#package-selection-header'
        );
        return;
      }
      if (step >= 4) {
        if (!this.canGoToStep2()) {
          this.navigateToStepWithWarning(
            1,
            'Debes seleccionar una fecha y un horario disponible primero. Estos campos son necesarios para generar tu cotización.',
            '#date-selection-header'
          );
          return;
        }
        if (!this.canGoToStep3()) {
          this.navigateToStepWithWarning(
            2,
            'Debes seleccionar un paquete y su merienda primero. Estos campos son necesarios para generar tu cotización.',
            '#package-selection-header'
          );
          return;
        }
      }
    }
    
    this.activeStep.set(step);
  }

  navigateToStepWithWarning(targetStep: number, warningDetail: string, focusSelector?: string): void {
    this.messageService.add({
      severity: 'warn',
      summary: 'Campos necesarios para generar tu cotización',
      detail: warningDetail,
      life: 5000
    });

    this.activeStep.set(targetStep);

    if (focusSelector) {
      setTimeout(() => {
        const el = document.querySelector(focusSelector);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) {
            el.focus();
          }
        }
      }, 300);
    }
  }

  handleSummaryClick(field: 'fecha' | 'paquete' | 'extras' | 'total'): void {
    if (field === 'fecha') {
      this.activeStep.set(1);
      setTimeout(() => {
        const el = document.querySelector('#date-selection-header');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    } else if (field === 'paquete') {
      if (!this.canGoToStep2()) {
        this.navigateToStepWithWarning(
          1,
          'Primero debes elegir una fecha y horario para ver los paquetes disponibles. Estos campos son necesarios para generar tu cotización.',
          '#date-selection-header'
        );
      } else {
        this.activeStep.set(2);
        setTimeout(() => {
          const el = document.querySelector('#package-selection-header');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    } else if (field === 'extras') {
      if (!this.canGoToStep2()) {
        this.navigateToStepWithWarning(
          1,
          'Primero debes elegir una fecha y horario. Estos campos son necesarios para generar tu cotización.',
          '#date-selection-header'
        );
      } else if (!this.canGoToStep3()) {
        this.navigateToStepWithWarning(
          2,
          'Primero debes seleccionar un paquete. Estos campos son necesarios para generar tu cotización.',
          '#package-selection-header'
        );
      } else {
        this.activeStep.set(3);
        setTimeout(() => {
          const el = document.querySelector('#extras-selection-header');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    } else if (field === 'total') {
      if (!this.canGoToStep2()) {
        this.navigateToStepWithWarning(
          1,
          'Primero debes elegir una fecha y horario. Estos campos son necesarios para generar tu cotización.',
          '#date-selection-header'
        );
      } else if (!this.canGoToStep3()) {
        this.navigateToStepWithWarning(
          2,
          'Primero debes seleccionar un paquete. Estos campos son necesarios para generar tu cotización.',
          '#package-selection-header'
        );
      } else {
        this.activeStep.set(4);
        setTimeout(() => {
          const el = document.querySelector('#contact-form-header');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          setTimeout(() => {
            const input = document.getElementById('res-name');
            if (input) input.focus();
          }, 300);
        }, 300);
      }
    }
  }

  showRequiredFieldsMessage(): void {
    this.messageService.add({
      severity: 'warn',
      summary: 'Campos necesarios para generar tu cotización',
      detail: 'Por favor, llena los datos de contacto obligatorios indicados con asterisco (*).',
      life: 5000
    });

    const contactHeader = document.getElementById('contact-form-header');
    if (contactHeader) {
      contactHeader.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setTimeout(() => {
      const controls = [
        { id: 'res-name', name: 'guest_name' },
        { id: 'res-email', name: 'guest_email' },
        { id: 'res-phone', name: 'guest_phone' }
      ];
      for (const item of controls) {
        const ctrl = this.contactForm.get(item.name);
        if (ctrl && ctrl.invalid) {
          const input = document.getElementById(item.id);
          if (input) {
            input.focus();
            break;
          }
        }
      }
    }, 500);
  }

  // ── Step 5: Submit ──
  async submitReservation(): Promise<void> {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      this.showRequiredFieldsMessage();
      return;
    }

    const date = this.selectedDate();
    const slot = this.selectedSlot();
    const pkg = this.selectedPackage();
    if (!date || !slot || !pkg) return;

    this.submitting.set(true);

    let reservation = this.lastGeneratedReservation();

    if (!reservation) {
      const contact = this.contactForm.getRawValue();
      const user = this.authService.currentUser();
      const snack = this.selectedSnackOption();
      const venue = this.publicVenue.activeVenue();

      try {
        reservation = await this.reservationService.createPrivateReservation({
          venue_id: venue?.id ?? '00000000-0000-0000-0000-000000000001',
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
          deposit_cents: this.depositCents(),
          notes: contact.notes || undefined,
          snack_option_id: snack?.id,
          quote_id: this.linkedQuoteId() ?? undefined,
          extras: this.selectedExtras().map((se) => ({
            extra_id: se.extra.id,
            quantity: se.quantity,
            unit_price_cents: se.extra.price_cents,
          })),
        });

        if (reservation) {
          this.lastGeneratedReservation.set(reservation);
        }
      } catch (err: any) {
        this.messageService.add({
          severity: 'error',
          summary: 'Error al crear la reserva',
          detail: err.message || 'Intenta de nuevo más tarde.',
        });
        this.submitting.set(false);
        return;
      }
    }

    if (!reservation) {
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

  async submitAdminLocalReservation(): Promise<void> {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      this.showRequiredFieldsMessage();
      return;
    }

    const date = this.selectedDate();
    const slot = this.selectedSlot();
    const pkg = this.selectedPackage();
    if (!date || !slot || !pkg) return;

    this.submitting.set(true);

    let reservation = this.lastGeneratedReservation();

    if (!reservation) {
      const contact = this.contactForm.getRawValue();
      const user = this.authService.currentUser();
      const snack = this.selectedSnackOption();
      const venue = this.publicVenue.activeVenue();

      try {
        reservation = await this.reservationService.createPrivateReservation({
          venue_id: venue?.id ?? '00000000-0000-0000-0000-000000000001',
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
          deposit_cents: this.depositCents(),
          notes: contact.notes || undefined,
          snack_option_id: snack?.id,
          quote_id: this.linkedQuoteId() ?? undefined,
          extras: this.selectedExtras().map((se) => ({
            extra_id: se.extra.id,
            quantity: se.quantity,
            unit_price_cents: se.extra.price_cents,
          })),
        });

        if (reservation) {
          this.lastGeneratedReservation.set(reservation);
        }
      } catch (err: any) {
        this.messageService.add({
          severity: 'error',
          summary: 'Error al crear la reserva',
          detail: err.message || 'Intenta de nuevo más tarde.',
        });
        this.submitting.set(false);
        return;
      }
    }

    if (!reservation) {
      this.submitting.set(false);
      return;
    }

    this.messageService.add({
      severity: 'success',
      summary: 'Reserva creada con éxito',
    });

    await this.router.navigate(['/admin/reservas'], {
      state: { openPaymentFor: reservation.id }
    });

    this.submitting.set(false);
  }

  async generateQuoteOnly(method: 'download' | 'whatsapp' | 'email'): Promise<void> {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      this.showRequiredFieldsMessage();
      return;
    }

    const date = this.selectedDate();
    const slot = this.selectedSlot();
    const pkg = this.selectedPackage();
    if (!date || !slot || !pkg) return;

    this.generatingQuote.set(true);

    try {
      const contact = this.contactForm.getRawValue();
      const snack = this.selectedSnackOption();
      
      let reservation = this.lastGeneratedReservation();

      if (!reservation) {
        const user = this.authService.currentUser();
        const venue = this.publicVenue.activeVenue();

        reservation = await this.reservationService.createPrivateReservation({
          venue_id: venue?.id ?? '00000000-0000-0000-0000-000000000001',
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
          deposit_cents: this.depositCents(),
          notes: contact.notes || undefined,
          snack_option_id: snack?.id,
          quote_id: this.linkedQuoteId() ?? undefined,
          extras: this.selectedExtras().map((se) => ({
            extra_id: se.extra.id,
            quantity: se.quantity,
            unit_price_cents: se.extra.price_cents,
          })),
        });

        if (!reservation) {
          throw new Error('No se pudo generar la reserva/cotización.');
        }

        this.lastGeneratedReservation.set(reservation);
      }

      const snackName = snack?.name ?? null;
      const printData = this.buildPrintData(
        reservation,
        date,
        slot,
        pkg,
        snackName,
        this.selectedExtras()
      );

      if (method === 'download') {
        this.printService.print(printData);
      } else if (method === 'whatsapp') {
        const whatsappUrl = this.printService.getWhatsAppUrl(printData, false);
        window.open(whatsappUrl, '_blank');
      } else if (method === 'email') {
        const link = `${window.location.origin}/reserva/${reservation.access_token}`;
        const subject = `Cotización Fiesta Privada - Hula Hoop`;
        const body = `Hola ${contact.guest_name},\n\nAquí tienes el enlace a tu cotización para la fiesta privada en Hula Hoop:\n\n${link}\n\n¡Gracias!`;
        window.location.href = `mailto:${contact.guest_email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      }

      this.messageService.add({
        severity: 'success',
        summary: 'Acción completada',
        detail: 'Cotización procesada con éxito.',
      });

    } catch (err: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error al procesar cotización',
        detail: err.message || 'Intenta de nuevo más tarde.',
      });
    } finally {
      this.generatingQuote.set(false);
    }
  }

  getLiquidationDateString(date: Date, days: number | undefined): string | null {
    if (!days) return null;
    const d = new Date(date.getTime());
    d.setDate(d.getDate() - days);
    return d.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private buildPrintData(
    res: any,
    date: Date,
    slot: TimeSlot,
    pkg: PartyPackage,
    snackName: string | null,
    extras: SelectedExtra[]
  ): ReservationPrintData {
    const guest_count_label = `${this.guestCount()} invitados`;
    const liquidation_date = this.getLiquidationDateString(date, pkg.days_to_liquidate);

    return {
      type: 'private',
      statusLabel: 'Pendiente de pago',
      guest_name: res.guest_name,
      guest_email: res.guest_email,
      guest_phone: res.guest_phone,
      reservation_date: this.formatDateDisplay(date),
      time_slot_label: `${this.formatTime(slot.start_time)} – ${this.formatTime(slot.end_time)}`,
      guest_count_label,
      snack_name: snackName,
      notes: res.notes,
      extras: extras.map(se => ({
        name: se.extra.name,
        quantity: se.quantity,
        unit_price_cents: se.extra.price_cents,
        pay_at_venue: se.extra.pay_at_venue
      })),
      subtotal_cents: this.subtotalCents(),
      total_cents: this.totalCents(),
      paid_deposit_cents: 0,
      liquidation_date,
      access_token: res.access_token,
    };
  }

  private clearCachedQuoteToken(): void {
    this.generatedQuoteToken.set(null);
    this.lastGeneratedReservation.set(null);
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
