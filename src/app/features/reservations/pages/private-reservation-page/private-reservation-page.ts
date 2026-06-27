import { ChangeDetectionStrategy, Component, computed, inject, signal, effect } from '@angular/core';
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
import { SnackOptionService } from '../../../../core/services/snack-option.service';
import { VenueConfigService } from '../../../../core/services/venue-config.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PaymentService } from '../../../../core/services/payment.service';
import { QuoteService } from '../../../../core/services/quote.service';
import { ContractService } from '../../../../core/services/contract.service';
import { ClientService } from '../../../../core/services/client.service';
import { PublicVenueService } from '../../../../core/services/public-venue.service';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';
import type { PartyPackage } from '../../../../core/interfaces/package';
import type { Extra } from '../../../../core/interfaces/extra';
import type { SnackOption } from '../../../../core/interfaces/snack-option';
import type { VenueConfig } from '../../../../core/interfaces/venue-config';
import type { Quote, CreateQuoteData } from '../../../../core/interfaces/quote';

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
  private readonly authService = inject(AuthService);
  private readonly paymentService = inject(PaymentService);
  private readonly quoteService = inject(QuoteService);
  private readonly contractService = inject(ContractService);
  private readonly clientService = inject(ClientService);
  private readonly publicVenue = inject(PublicVenueService);
  private readonly fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);

  // ── State ──
  readonly activeStep     = signal(1);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly lastGeneratedReservation = signal<Quote | null>(null);
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

      const venue = this.publicVenue.activeVenue();
      const venueId = venue?.id ?? '00000000-0000-0000-0000-000000000001';
      const blocked = await this.contractService.checkSlotConflict(venueId, dateStr, slot.start_time, slot.end_time);
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

  // ── Client lookup / creation ──
  private async findOrCreateClient(email: string, nombre: string, telefono: string): Promise<string | undefined> {
    if (!email) return undefined;
    const existing = await this.clientService.getByEmail(email);
    if (existing) return existing.id;
    const created = await this.clientService.create({
      nombre,
      email,
      telefono: telefono || undefined,
    });
    return created?.id;
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

    try {
      const contact = this.contactForm.getRawValue();
      const snack = this.selectedSnackOption();

      const clientId = await this.findOrCreateClient(
        contact.guest_email,
        contact.guest_name,
        contact.guest_phone,
      );

      const quote = await this.quoteService.create({
        venue_id:        this.publicVenue.activeVenue()?.id,
        fecha:           new Date().toISOString().split('T')[0],
        fecha_evento:    this.formatDateISO(date),
        hora_inicio:     slot.start_time,
        hora_fin:        slot.end_time,
        time_slot_id:    slot.id,
        guest_count:     this.guestCount(),
        snack_option_id: snack?.id ?? undefined,
        package_id:      pkg.id,
        subtotal:        this.subtotalCents() / 100,
        descuento:       0,
        total:           this.totalCents() / 100,
        deposit_amount:  this.depositCents() / 100,
        estado:          'enviada',
        client_id:       clientId,
        notas:           contact.notes?.trim() || undefined,
        items:           this.buildQuoteItems(),
      });

      if (quote) {
        this.lastGeneratedReservation.set(quote);
        await this.router.navigate(['/cotizacion', quote.public_token]);
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Error al crear la cotización',
          detail: 'No se pudo crear la cotización. Intenta de nuevo más tarde.',
        });
      }
    } catch (err: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error al crear la cotización',
        detail: err.message || 'Intenta de nuevo más tarde.',
      });
    } finally {
      this.submitting.set(false);
    }
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

    try {
      const contact = this.contactForm.getRawValue();
      const snack = this.selectedSnackOption();

      const clientId = await this.findOrCreateClient(
        contact.guest_email,
        contact.guest_name,
        contact.guest_phone,
      );

      const quote = await this.quoteService.create({
        venue_id:        this.publicVenue.activeVenue()?.id,
        fecha:           new Date().toISOString().split('T')[0],
        fecha_evento:    this.formatDateISO(date),
        hora_inicio:     slot.start_time,
        hora_fin:        slot.end_time,
        time_slot_id:    slot.id,
        guest_count:     this.guestCount(),
        snack_option_id: snack?.id ?? undefined,
        package_id:      pkg.id,
        subtotal:        this.subtotalCents() / 100,
        descuento:       0,
        total:           this.totalCents() / 100,
        deposit_amount:  this.depositCents() / 100,
        estado:          'enviada',
        client_id:       clientId,
        notas:           contact.notes?.trim() || undefined,
        items:           this.buildQuoteItems(),
      });

      if (quote) {
        this.lastGeneratedReservation.set(quote);
        this.messageService.add({
          severity: 'success',
          summary: 'Cotización creada con éxito',
        });
        await this.router.navigate(['/admin/cotizaciones']);
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Error al crear la cotización',
          detail: 'No se pudo crear la cotización. Intenta de nuevo más tarde.',
        });
      }
    } catch (err: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error al crear la cotización',
        detail: err.message || 'Intenta de nuevo más tarde.',
      });
    } finally {
      this.submitting.set(false);
    }
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

      let quote = this.lastGeneratedReservation() as Quote | null;

      if (!quote) {
        const clientId = await this.findOrCreateClient(
          contact.guest_email,
          contact.guest_name,
          contact.guest_phone,
        );

        quote = await this.quoteService.create({
          fecha:           new Date().toISOString().split('T')[0],
          fecha_evento:    this.formatDateISO(date),
          hora_inicio:     slot.start_time,
          hora_fin:        slot.end_time,
          time_slot_id:    slot.id,
          guest_count:     this.guestCount(),
          snack_option_id: snack?.id ?? undefined,
          package_id:      pkg.id,
          subtotal:        this.subtotalCents() / 100,
          descuento:       0,
          total:           this.totalCents() / 100,
          deposit_amount:  this.depositCents() / 100,
          estado:          'enviada',
          client_id:       clientId,
          notas:           contact.notes?.trim() || undefined,
          items:           this.buildQuoteItems(),
        });

        if (!quote) {
          throw new Error('No se pudo generar la cotización.');
        }

        this.lastGeneratedReservation.set(quote);
      }

      const publicLink = `${window.location.origin}/cotizacion/${quote.public_token}`;

      if (method === 'download') {
        window.open(publicLink, '_blank');
      } else if (method === 'whatsapp') {
        const text = `Hola ${contact.guest_name}, aquí tienes tu cotización para la fiesta privada en Hula Hoop:\n${publicLink}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      } else if (method === 'email') {
        const subject = `Cotización Fiesta Privada - Hula Hoop`;
        const body = `Hola ${contact.guest_name},\n\nAquí tienes el enlace a tu cotización para la fiesta privada en Hula Hoop:\n\n${publicLink}\n\n¡Gracias!`;
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

  private buildQuoteItems(): CreateQuoteData['items'] {
    const items: CreateQuoteData['items'] = [];

    const pkg = this.selectedPackage();
    if (pkg) {
      items.push({
        descripcion:     pkg.name,
        cantidad:        1,
        precio_unitario: pkg.price_cents / 100,
      });
    }

    const snack = this.selectedSnackOption();
    if (snack) {
      // Snack options don't carry a separate price — included in package
      items.push({
        descripcion:     `Merienda: ${snack.name}`,
        cantidad:        1,
        precio_unitario: 0,
      });
    }

    for (const se of this.selectedExtras()) {
      items.push({
        descripcion:     se.extra.pay_at_venue
          ? `${se.extra.name} (cobro en local)`
          : se.extra.name,
        cantidad:        se.quantity,
        precio_unitario: se.extra.pay_at_venue ? 0 : se.extra.price_cents / 100,
      });
    }

    return items;
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
