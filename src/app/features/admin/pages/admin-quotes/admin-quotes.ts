import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { QuoteService } from '../../../../core/services/quote.service';
import { ClientService } from '../../../../core/services/client.service';
import { ContractService } from '../../../../core/services/contract.service';
import { PackageService } from '../../../../core/services/package.service';
import { ExtraService } from '../../../../core/services/extra.service';
import { SnackOptionService } from '../../../../core/services/snack-option.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import { ReservationService } from '../../../../core/services/reservation.service';
import { VenueService } from '../../../../core/services/venue.service';
import { PosTicketPrintService } from '../../../../core/services/pos-ticket-print.service';
import type { Quote, QuoteStatus, CreateQuoteData } from '../../../../core/interfaces/quote';
import type { Client } from '../../../../core/interfaces/client';
import type { PartyPackage } from '../../../../core/interfaces/package';
import type { Extra, ExtraCategory } from '../../../../core/interfaces/extra';
import type { SnackOption } from '../../../../core/interfaces/snack-option';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';
import { StepperModule } from 'primeng/stepper';
import { DatePickerModule } from 'primeng/datepicker';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';

export interface AvailableDate {
  date:    string;
  label:   string;
  dayType: 'weekday' | 'weekend';
  slot:    Pick<TimeSlot, 'start_time' | 'end_time'>;
}

type WizardStep = 1 | 2 | 3 | 4 | 5;
type PayMethod = 'efectivo' | 'tarjeta' | 'transferencia';

export interface SlotAvailability {
  slot: TimeSlot;
  blocked: boolean;
}

const STATUS_CONFIG: Record<QuoteStatus, { label: string; classes: string }> = {
  borrador:  { label: 'Borrador',  classes: 'bg-slate-100 text-slate-600' },
  enviada:   { label: 'Enviada',   classes: 'bg-blue-100 text-blue-700' },
  aprobada:  { label: 'Aprobada',  classes: 'bg-emerald-100 text-emerald-700' },
  rechazada: { label: 'Rechazada', classes: 'bg-red-100 text-red-700' },
  vencida:   { label: 'Vencida',   classes: 'bg-amber-100 text-amber-700' },
};

const PACKAGE_COLOR_HEX: Record<string, string> = {
  'lima':              '#8CE9AF',
  'rosa-pastel':       '#EDB2E4',
  'azul-cielo':        '#85E8E3',
  'morado':            '#686ABB',
  'rojo-brillante':    '#E30D1C',
  'naranja':           '#FC7632',
  'marron':            '#B28B7E',
  'amarillo-merengue': '#F6F090',
};

@Component({
  selector: 'app-admin-quotes',
  templateUrl: './admin-quotes.html',
  imports: [
    FormsModule,
    StepperModule,
    DatePickerModule,
    ToggleSwitchModule,
    CurrencyMxnPipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminQuotes {
  private readonly quoteService       = inject(QuoteService);
  private readonly clientService      = inject(ClientService);
  private readonly contractService    = inject(ContractService);
  private readonly packageService     = inject(PackageService);
  private readonly extraService       = inject(ExtraService);
  private readonly snackOptionService = inject(SnackOptionService);
  private readonly timeSlotService    = inject(TimeSlotService);
  private readonly reservationService = inject(ReservationService);
  private readonly venueService       = inject(VenueService);
  private readonly ticketPrint        = inject(PosTicketPrintService);
  private readonly router             = inject(Router);
  private readonly platformId         = inject(PLATFORM_ID);

  // ── Catalog data ─────────────────────────────────────────
  readonly packages     = signal<PartyPackage[]>([]);
  readonly extras       = signal<Extra[]>([]);

  private static readonly EXTRA_CATEGORY_ORDER: ExtraCategory[] = [
    'extras',
    'hula_munch_bar',
    'servicios_adicionales',
  ];

  private static readonly EXTRA_CATEGORY_LABELS: Record<ExtraCategory, string> = {
    extras: 'Extras',
    hula_munch_bar: 'Hula Munch Bar',
    servicios_adicionales: 'Servicios Adicionales',
  };

  readonly extrasByCategory = computed(() => {
    const allExtras = this.extras();
    return AdminQuotes.EXTRA_CATEGORY_ORDER
      .map(cat => ({
        category: cat,
        label: AdminQuotes.EXTRA_CATEGORY_LABELS[cat],
        items: allExtras.filter(e => e.category === cat),
      }))
      .filter(group => group.items.length > 0);
  });

  readonly snackOptions = signal<SnackOption[]>([]);
  readonly allSlots     = signal<TimeSlot[]>([]);
  readonly allClients      = signal<Client[]>([]);
  readonly quotes          = signal<Quote[]>([]);
  /** Maps quote_id → contract.id for approved quotes */
  readonly contractByQuote = signal<Map<string, string>>(new Map());

  // ── Page state ───────────────────────────────────────────
  readonly loading      = signal(true);
  readonly statusFilter = signal<QuoteStatus | 'all'>('all');
  readonly toast        = signal<{ type: 'success' | 'error'; message: string } | null>(null);
  readonly deleteTarget = signal<Quote | null>(null);

  // ── Wizard / drawer state ─────────────────────────────────
  readonly drawerOpen    = signal(false);
  readonly wizardStep    = signal<WizardStep>(1);
  readonly saving        = signal(false);
  readonly editingQuote  = signal<Quote | null>(null);

  // Step 1 — Cliente
  readonly clientQuery        = signal('');
  readonly clientDropdownOpen = signal(false);
  readonly selectedClient     = signal<Client | null>(null);
  readonly guestCount         = signal<number>(10);

  // Step 1 — Inline client creation
  readonly showCreateClient = signal(false);
  readonly newClientName    = signal('');
  readonly newClientPhone   = signal('');
  readonly newClientEmail   = signal('');
  readonly savingNewClient  = signal(false);

  // Step 2 — Fecha & Horario
  readonly selectedDate  = signal<Date | null>(null);
  readonly daySlots      = signal<SlotAvailability[]>([]);
  readonly selectedSlot  = signal<TimeSlot | null>(null);
  readonly loadingSlots  = signal(false);

  // Step 3 — Paquete & Merienda
  readonly selectedCategory    = signal<'hula_hula' | 'hooping'>('hula_hula');
  readonly selectedPackage     = signal<PartyPackage | null>(null);
  readonly selectedSnack       = signal<SnackOption | null>(null);
  readonly skipSnack           = signal(false);

  // Step 4 — Experiencias & Extras
  readonly selectedDecoration  = signal<'petite' | 'grand' | 'plus'>('petite');
  readonly glamGirlsEnabled    = signal<boolean>(false);
  readonly glamGirlsCount      = signal<number>(5);
  readonly selectedActivity    = signal<any | null>(null);
  readonly activeActivityTab   = signal<'A' | 'B' | 'C'>('A');

  readonly activitiesList = signal([
    { id: 'act_a1', group: 'A', name: 'Decora tu galleta', price_per_person: 0 },
    { id: 'act_a2', group: 'A', name: 'Decora tu cupcake', price_per_person: 0 },
    { id: 'act_a3', group: 'A', name: 'Decora tu rice krispi', price_per_person: 0 },
    { id: 'act_a4', group: 'A', name: 'Friendship bracelets', price_per_person: 0 },
    { id: 'act_a5', group: 'A', name: 'Botella sensorial', price_per_person: 0 },
    { id: 'act_a6', group: 'A', name: 'Capa de superhéroe', price_per_person: 0 },
    { id: 'act_a7', group: 'A', name: 'Decora tu máscara', price_per_person: 0 },

    { id: 'act_b1', group: 'B', name: 'Ice cream slab', price_per_person: 60 },
    { id: 'act_b2', group: 'B', name: 'Decora tu pastel', price_per_person: 65 },
    { id: 'act_b3', group: 'B', name: 'Pinta tu alcancía', price_per_person: 90 },
    { id: 'act_b4', group: 'B', name: 'Pinta tu canvas', price_per_person: 80 },

    { id: 'act_c1', group: 'C', name: 'Decora tu peine', price_per_person: 65 },
    { id: 'act_c2', group: 'C', name: 'Decora tu totebag', price_per_person: 85 },
    { id: 'act_c3', group: 'C', name: 'Decora tu bucket hat', price_per_person: 90 },
    { id: 'act_c4', group: 'C', name: 'Decora tu lapicera', price_per_person: 65 },
    { id: 'act_c5', group: 'C', name: 'Decora tu gorra', price_per_person: 80 }
  ]);

  readonly extraQty = signal<Map<string, number>>(new Map());
  readonly extraVariant = signal<Map<string, string>>(new Map());

  // Step 5 — Resumen
  readonly discount = signal<number>(0);
  readonly notes    = signal<string>('');

  // ── Send popover ─────────────────────────────────────────
  readonly sendTarget  = signal<Quote | null>(null);
  readonly sendMessage = signal('');

  // ── Anticipo dialog (quote → contract) ───────────────────
  readonly anticoDialog  = signal<Quote | null>(null);
  readonly anticoMonto   = signal(0);
  readonly anticoFecha   = signal('');
  readonly anticoMetodo  = signal<PayMethod>('efectivo');
  readonly anticoSaving  = signal(false);

  // ── Slot conflict detection (list view) ───────────────────
  readonly conflictMap             = signal<Map<string, { folio: string; cliente: string }>>(new Map());
  readonly rescheduleDialog        = signal<Quote | null>(null);
  readonly rescheduleAvailableDates = signal<AvailableDate[]>([]);
  readonly rescheduleSaving        = signal(false);
  readonly rescheduleLoadingDates  = signal(false);

  // ── Computed ─────────────────────────────────────────────
  readonly STATUS_CONFIG = STATUS_CONFIG;

  readonly minDate = computed(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });

  readonly filteredQuotes = computed(() => {
    const f = this.statusFilter();
    return f === 'all' ? this.quotes() : this.quotes().filter((q) => q.estado === f);
  });

  readonly clientResults = computed(() => {
    const q = this.clientQuery().toLowerCase().trim();
    if (!q) return this.allClients().slice(0, 6);
    return this.allClients()
      .filter(
        (c) =>
          c.nombre.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.telefono?.includes(q),
      )
      .slice(0, 8);
  });

  readonly statusOptions: Array<{ value: QuoteStatus | 'all'; label: string }> = [
    { value: 'all',       label: 'Todos' },
    { value: 'borrador',  label: 'Borrador' },
    { value: 'enviada',   label: 'Enviada' },
    { value: 'aprobada',  label: 'Aprobada' },
    { value: 'rechazada', label: 'Rechazada' },
    { value: 'vencida',   label: 'Vencida' },
  ];

  readonly filteredPackages = computed(() => {
    const cat = this.selectedCategory();
    return this.packages().filter(p => {
      const isHoopingPkg = p.name.toLowerCase().includes('hooping');
      return cat === 'hooping' ? isHoopingPkg : !isHoopingPkg;
    });
  });

  readonly isMorningSlot = computed(() => {
    const slot = this.selectedSlot();
    if (!slot) return false;
    const hour = parseInt(slot.start_time.split(':')[0], 10);
    return hour < 12;
  });

  readonly filteredSnackOptions = computed(() => {
    const isAM = this.isMorningSlot();
    const amKeywords = ['chilaquiles', 'molletes', 'croissant', 'crossaint'];
    return this.snackOptions().filter(option => {
      const nameLower = option.name.toLowerCase();
      const isAMOption = amKeywords.some(keyword => nameLower.includes(keyword));
      return isAM ? isAMOption : !isAMOption;
    });
  });

  readonly selectedExtras = computed(() => {
    const qty = this.extraQty();
    const vars = this.extraVariant();
    return this.extras()
      .filter((e) => (qty.get(e.id) ?? 0) > 0)
      .map((e) => {
        const quantity = qty.get(e.id)!;
        let variantId = vars.get(e.id);
        if (!variantId && e.variants && e.variants.length > 0) {
          variantId = e.variants[0].id;
        }
        const variant = e.variants?.find((v) => v.id === variantId) || null;
        return { extra: e, quantity, variant };
      });
  });

  // Price calculations
  readonly subtotalCents = computed(() => {
    const pkg = this.selectedPackage();
    return pkg?.price_cents ?? 0;
  });

  readonly decorationUpgradeCents = computed(() => {
    const cat = this.selectedCategory();
    const dec = this.selectedDecoration();
    if (cat === 'hula_hula') {
      if (dec === 'grand') return 140000;
      if (dec === 'plus') return 270000;
    } else if (cat === 'hooping') {
      if (dec === 'plus') return 130000;
    }
    return 0;
  });

  readonly activityUpgradeCents = computed(() => {
    const cat = this.selectedCategory();
    const act = this.selectedActivity();
    const guests = this.guestCount();
    if (cat === 'hooping' && act && act.price_per_person) {
      return act.price_per_person * guests * 100;
    }
    return 0;
  });

  readonly glamGirlsCents = computed(() => {
    if (!this.glamGirlsEnabled()) return 0;
    return this.glamGirlsCount() * 30000;
  });

  readonly extrasTotalCents = computed(() => {
    return this.selectedExtras().reduce((sum, se) => {
      if (se.extra.pay_at_venue) return sum;
      const unitPrice = se.variant ? se.variant.price_cents : se.extra.price_cents;
      return sum + (unitPrice * se.quantity);
    }, 0);
  });

  readonly totalCents = computed(() => {
    return this.subtotalCents() +
           this.extrasTotalCents() +
           this.decorationUpgradeCents() +
           this.activityUpgradeCents() +
           this.glamGirlsCents();
  });

  readonly summaryItems = computed(() => {
    return this.buildQuoteItems();
  });

  readonly subtotalAmount = computed(() => this.totalCents() / 100);

  readonly totalAmount = computed(() => Math.max(0, this.subtotalAmount() - this.discount()));

  readonly depositAmount = computed(() => {
    const pkg = this.selectedPackage();
    if (!pkg) return 0;
    const total = this.totalAmount();
    if (pkg.deposit_type === 'full') return total;
    if (pkg.deposit_type === 'percentage') {
      return Math.round(total * pkg.deposit_value) / 100;
    }
    return Math.min(pkg.deposit_value / 100, total);
  });

  readonly balanceDue = computed(() => Math.max(0, this.totalAmount() - this.depositAmount()));

  readonly todayStr = computed(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  readonly step1Valid = computed(() => this.selectedClient() !== null);
  readonly step2Valid = computed(() => !!this.selectedDate() && this.selectedSlot() !== null);
  readonly step3Valid = computed(() => this.selectedPackage() !== null);
  readonly step4Valid = computed(() => this.selectedCategory() === 'hooping' ? this.selectedActivity() !== null : true);
  readonly step5Valid = computed(() => true);

  constructor() {
    this.loadAll();

    effect(() => {
      const am = this.isMorningSlot();
      const snack = this.selectedSnack();
      if (snack) {
        const nameLower = snack.name.toLowerCase();
        const amKeywords = ['chilaquiles', 'molletes', 'croissant', 'crossaint'];
        const isAMOption = amKeywords.some((keyword) => nameLower.includes(keyword));
        if (am !== isAMOption) {
          this.selectedSnack.set(null);
        }
      }
    }, { allowSignalWrites: true });
  }

  private async loadAll(): Promise<void> {
    const [quotes, clients, packages, extras, snacks, slots, contracts] = await Promise.all([
      this.quoteService.getAll(),
      this.clientService.getAll(),
      this.packageService.getActivePackages(),
      this.extraService.getActiveExtras(),
      this.snackOptionService.getActiveSnackOptions(),
      this.timeSlotService.getActiveSlots(),
      this.contractService.getAll(),
    ]);
    this.quotes.set(quotes);
    this.allClients.set(clients);
    this.packages.set(packages);
    this.extras.set(extras);
    this.snackOptions.set(snacks);
    this.allSlots.set(slots);
    const map = new Map<string, string>();
    for (const c of contracts) {
      if (c.quote_id) map.set(c.quote_id, c.id);
    }
    this.contractByQuote.set(map);
    this.loading.set(false);
    void this.checkConflictsForPendingQuotes(quotes);
  }

  // ── Category and Personalization ─────────────────────────
  setCategory(cat: 'hula_hula' | 'hooping'): void {
    this.selectedCategory.set(cat);
    if (cat === 'hula_hula') {
      this.selectedActivity.set(null);
      this.selectedDecoration.set('petite');
    } else {
      this.selectedDecoration.set('grand');
    }
  }

  toggleGlamGirls(val: boolean): void {
    this.glamGirlsEnabled.set(val);
    if (!val) {
      this.glamGirlsCount.set(5);
    }
  }

  updateGlamGirlsCount(qty: number): void {
    this.glamGirlsCount.set(Math.max(5, qty));
  }

  selectActivity(act: any): void {
    this.selectedActivity.set(act);
  }

  // ── Wizard navigation ─────────────────────────────────────
  openCreate(): void {
    this.resetWizard();
    this.editingQuote.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(quote: Quote): void {
    this.resetWizard();
    this.editingQuote.set(quote);

    const client = this.allClients().find((c) => c.id === quote.client_id) ?? null;
    this.selectedClient.set(client);
    this.guestCount.set(quote.guest_count ?? 10);

    if (quote.fecha_evento) {
      this.selectedDate.set(new Date(quote.fecha_evento + 'T12:00:00'));
      void this.loadSlotsForDate(quote.fecha_evento, quote.hora_inicio ?? undefined);
    }
    this.discount.set(quote.descuento ?? 0);
    this.notes.set(quote.notas ?? '');

    if (quote.package_id) {
      const pkg = this.packages().find((p) => p.id === quote.package_id) ?? null;
      this.selectedPackage.set(pkg);
    }

    if (quote.snack_option_id) {
      const snack = this.snackOptions().find((s) => s.id === quote.snack_option_id) ?? null;
      this.selectedSnack.set(snack);
    } else {
      this.skipSnack.set(true);
    }

    // Parse items to determine category, decoration, activities, glam girls, and extras
    if (quote.items) {
      const currentPkg = this.selectedPackage();
      let foundCategory: 'hula_hula' | 'hooping' =
        currentPkg && currentPkg.name.toLowerCase().includes('hooping') ? 'hooping' : 'hula_hula';
      let foundDecoration: 'petite' | 'grand' | 'plus' = 'petite';
      let foundActivity: any = null;
      let foundGlamGirls = false;
      let foundGlamGirlsCount = 5;
      const parsedExtras = new Map<string, number>();
      const parsedVariants = new Map<string, string>();

      for (const item of quote.items) {
        const desc = item.descripcion;

        if (desc.startsWith('Upgrade de Decoración:')) {
          const decType = desc.split(':').pop()?.trim().toLowerCase();
          if (decType === 'grand') foundDecoration = 'grand';
          if (decType === 'plus') foundDecoration = 'plus';
        }

        if (desc.startsWith('Actividad Premium:') || desc.startsWith('Actividad Incluida:')) {
          foundCategory = 'hooping';
          const actName = desc.split(':').pop()?.trim();
          const act = this.activitiesList().find((a) => a.name === actName);
          if (act) foundActivity = act;
        }

        if (desc.startsWith('Área Glam Girls')) {
          foundGlamGirls = true;
          foundGlamGirlsCount = item.cantidad;
        }

        const matchedExtra = this.extras().find(
          (e) => desc === e.name || desc === `${e.name} (cobro en local)`
        );
        if (matchedExtra) {
          parsedExtras.set(matchedExtra.id, item.cantidad);
        } else {
          // Check if it matches an extra's variant:
          for (const e of this.extras()) {
            if (e.variants && e.variants.length > 0) {
              const matchedVar = e.variants.find(
                (v) => {
                  const varDesc = `${e.name} (${v.name})`;
                  return desc === varDesc || desc === `${varDesc} (cobro en local)`;
                }
              );
              if (matchedVar) {
                parsedExtras.set(e.id, item.cantidad);
                parsedVariants.set(e.id, matchedVar.id);
                break;
              }
            }
          }
        }
      }

      if (foundCategory === 'hooping' && foundDecoration === 'petite') {
        foundDecoration = 'grand';
      }

      this.selectedCategory.set(foundCategory);
      this.selectedDecoration.set(foundDecoration);
      this.selectedActivity.set(foundActivity);
      this.glamGirlsEnabled.set(foundGlamGirls);
      this.glamGirlsCount.set(foundGlamGirlsCount);
      this.extraQty.set(parsedExtras);
      this.extraVariant.set(parsedVariants);
    }

    this.wizardStep.set(5);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.resetWizard();
  }

  onStepChange(step: number | undefined): void {
    if (step === undefined) return;
    const current = this.wizardStep();
    if (step > current) {
      if (step >= 2 && !this.selectedClient()) {
        this.showToast('error', 'Debes seleccionar un cliente primero.');
        return;
      }
      if (step >= 3 && (!this.selectedDate() || !this.selectedSlot())) {
        this.showToast('error', 'Debes seleccionar fecha y horario disponible.');
        return;
      }
      if (step >= 4 && !this.selectedPackage()) {
        this.showToast('error', 'Debes seleccionar un paquete.');
        return;
      }
      if (step >= 5 && this.selectedCategory() === 'hooping' && !this.selectedActivity()) {
        this.showToast('error', 'Debes seleccionar una actividad para la categoría Hooping.');
        return;
      }
    }
    this.wizardStep.set(step as WizardStep);
  }

  // ── Step 1: Client search ─────────────────────────────────
  onClientInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.clientQuery.set(val);
    this.clientDropdownOpen.set(true);
    this.showCreateClient.set(false);
    if (!val) this.selectedClient.set(null);
  }

  selectClient(client: Client): void {
    this.selectedClient.set(client);
    this.clientQuery.set('');
    this.clientDropdownOpen.set(false);
    this.showCreateClient.set(false);
  }

  clearClient(): void {
    this.selectedClient.set(null);
    this.clientQuery.set('');
    this.showCreateClient.set(false);
  }

  onGuestCountInput(event: Event): void {
    const val = +(event.target as HTMLInputElement).value;
    this.guestCount.set(isNaN(val) ? 1 : Math.max(1, val));
  }

  // ── Step 1: Inline client creation ───────────────────────
  openCreateClient(): void {
    this.showCreateClient.set(true);
    this.newClientName.set(this.clientQuery().trim());
    this.newClientPhone.set('');
    this.newClientEmail.set('');
    this.clientDropdownOpen.set(false);
  }

  cancelCreateClient(): void {
    this.showCreateClient.set(false);
    this.newClientName.set('');
    this.newClientPhone.set('');
    this.newClientEmail.set('');
  }

  async submitCreateClient(): Promise<void> {
    const name = this.newClientName().trim();
    if (!name || this.savingNewClient()) return;
    this.savingNewClient.set(true);
    const created = await this.clientService.create({
      nombre:   name,
      telefono: this.newClientPhone().trim() || undefined,
      email:    this.newClientEmail().trim() || undefined,
    });
    if (created) {
      this.allClients.update((list) =>
        [...list, created].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      );
      this.selectClient(created);
      this.cancelCreateClient();
      this.showToast('success', `Cliente "${created.nombre}" creado`);
    } else {
      this.showToast('error', 'No se pudo crear el cliente');
    }
    this.savingNewClient.set(false);
  }

  // ── Step 2: Date & Slot ───────────────────────────────────
  async onDateSelect(date: Date): Promise<void> {
    this.selectedDate.set(date);
    this.selectedSlot.set(null);
    if (date) {
      const iso = this.formatDateISO(date);
      await this.loadSlotsForDate(iso);
    }
  }

  private async loadSlotsForDate(date: string, preselectedStart?: string): Promise<void> {
    this.loadingSlots.set(true);
    const venueId = this.venueService.currentVenueId();
    const d = new Date(date + 'T12:00:00');
    const day = d.getDay();
    const isWeekend = day === 0 || day === 6;
    const dayType = isWeekend ? 'weekend' : 'weekday';

    const slotsForDay = this.allSlots().filter((s) => s.day_type === dayType);

    const results: SlotAvailability[] = await Promise.all(
      slotsForDay.map(async (slot) => {
        const [blockedByPrivate, blockedByContract] = await Promise.all([
          this.reservationService.isSlotBlockedByPrivate(date, slot.id),
          venueId
            ? this.contractService.checkSlotConflict(venueId, date, slot.start_time, slot.end_time)
            : Promise.resolve(false),
        ]);
        return { slot, blocked: blockedByPrivate || blockedByContract };
      }),
    );

    this.daySlots.set(results);
    if (preselectedStart) {
      const match = results.find((r) => r.slot.start_time === preselectedStart);
      if (match && !match.blocked) this.selectedSlot.set(match.slot);
    }
    this.loadingSlots.set(false);
  }

  selectSlot(availability: SlotAvailability): void {
    if (availability.blocked) return;
    this.selectedSlot.set(availability.slot);
  }

  // ── Step 3: Package & Merienda ───────────────────────────
  selectPackage(pkg: PartyPackage): void {
    this.selectedPackage.set(pkg);
  }

  getPackageColor(pkg: PartyPackage): string {
    return pkg.color ? PACKAGE_COLOR_HEX[pkg.color] ?? '#E30D1C' : '#E30D1C';
  }

  isGuestOutOfRange(pkg: PartyPackage): boolean {
    const g = this.guestCount();
    return g < pkg.min_guests || g > pkg.max_guests;
  }

  selectSnack(snack: SnackOption): void {
    this.selectedSnack.set(snack);
    this.skipSnack.set(false);
  }

  setSkipSnack(): void {
    this.selectedSnack.set(null);
    this.skipSnack.set(true);
  }

  // ── Step 4: Extras & Experiencias ─────────────────────────
  getExtraQty(extraId: string): number {
    return this.extraQty().get(extraId) ?? 0;
  }

  setExtraQty(extraId: string, delta: number): void {
    const map = new Map(this.extraQty());
    const current = map.get(extraId) ?? 0;
    const next = Math.max(0, current + delta);
    if (next === 0) map.delete(extraId);
    else map.set(extraId, next);
    this.extraQty.set(map);
  }

  getExtraVariantId(extraId: string): string {
    const variantId = this.extraVariant().get(extraId);
    if (variantId) return variantId;

    const extra = this.extras().find((e) => e.id === extraId);
    if (extra && extra.variants && extra.variants.length > 0) {
      return extra.variants[0].id;
    }
    return '';
  }

  setExtraVariantId(extraId: string, variantId: string): void {
    const map = new Map(this.extraVariant());
    map.set(extraId, variantId);
    this.extraVariant.set(map);
  }

  // Helper date formats
  formatDateISO(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  formatDateDisplay(date: Date): string {
    return date.toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  isSlotMorning(slot: TimeSlot): boolean {
    if (!slot?.start_time) return false;
    const hour = parseInt(slot.start_time.split(':')[0], 10);
    return hour < 12;
  }

  formatTime(time: string): string {
    const [h, m] = time.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
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

    const snack = this.selectedSnack();
    if (snack && !this.skipSnack()) {
      items.push({
        descripcion:     `Merienda: ${snack.name}`,
        cantidad:        1,
        precio_unitario: 0,
      });
    }

    // Decoration upgrade
    const cat = this.selectedCategory();
    const dec = this.selectedDecoration();
    const decUpgradeCents = this.decorationUpgradeCents();
    if (decUpgradeCents > 0) {
      const decName = dec.toUpperCase();
      items.push({
        descripcion:     `Upgrade de Decoración: ${decName}`,
        cantidad:        1,
        precio_unitario: decUpgradeCents / 100,
      });
    }

    // Activity upgrade
    const act = this.selectedActivity();
    if (cat === 'hooping' && act) {
      if (act.price_per_person > 0) {
        items.push({
          descripcion:     `Actividad Premium: ${act.name}`,
          cantidad:        this.guestCount(),
          precio_unitario: act.price_per_person,
        });
      } else {
        items.push({
          descripcion:     `Actividad Incluida: ${act.name}`,
          cantidad:        1,
          precio_unitario: 0,
        });
      }
    }

    // Glam Girls
    if (this.glamGirlsEnabled()) {
      items.push({
        descripcion:     `Área Glam Girls (Glitter mani, make up, peinados)`,
        cantidad:        this.glamGirlsCount(),
        precio_unitario: 300,
      });
    }

    for (const se of this.selectedExtras()) {
      const name = se.variant ? `${se.extra.name} (${se.variant.name})` : se.extra.name;
      const price = se.variant ? se.variant.price_cents : se.extra.price_cents;
      items.push({
        descripcion:     se.extra.pay_at_venue
          ? `${name} (cobro en local)`
          : name,
        cantidad:        se.quantity,
        precio_unitario: se.extra.pay_at_venue ? 0 : price / 100,
      });
    }

    return items;
  }

  // ── Submit wizard ─────────────────────────────────────────
  async onSubmit(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);

    const payload = {
      client_id:       this.selectedClient()?.id,
      fecha:           this.todayStr(),
      fecha_evento:    this.selectedDate() ? this.formatDateISO(this.selectedDate()!) : undefined,
      hora_inicio:     this.selectedSlot()?.start_time,
      hora_fin:        this.selectedSlot()?.end_time,
      time_slot_id:    this.selectedSlot()?.id,
      guest_count:     this.guestCount(),
      estado:          'borrador' as QuoteStatus,
      subtotal:        this.subtotalAmount(),
      descuento:       this.discount(),
      total:           this.totalAmount(),
      deposit_amount:  this.depositAmount(),
      package_id:      this.selectedPackage()?.id ?? undefined,
      snack_option_id: this.selectedSnack()?.id ?? undefined,
      notas:           this.notes().trim() || undefined,
      items:           this.summaryItems().map((it) => ({
        descripcion:     it.descripcion,
        cantidad:        it.cantidad,
        precio_unitario: it.precio_unitario,
      })),
    };

    let result: Quote | null;
    const editing = this.editingQuote();
    if (editing) {
      result = await this.quoteService.updateFull(editing.id, payload);
    } else {
      result = await this.quoteService.create(payload);
    }

    if (result) {
      await this.refreshQuotes();
      this.closeDrawer();
      this.showToast('success', editing ? 'Cotización actualizada' : 'Cotización creada');
    } else {
      this.showToast('error', 'Ocurrió un error. Intenta de nuevo.');
    }
    this.saving.set(false);
  }

  // ── Status actions ────────────────────────────────────────
  async changeStatus(quote: Quote, estado: QuoteStatus): Promise<void> {
    const ok = await this.quoteService.updateStatus(quote.id, estado);
    if (ok) {
      this.quotes.update((list) => list.map((q) => (q.id === quote.id ? { ...q, estado } : q)));
      this.showToast('success', `Estado: ${STATUS_CONFIG[estado].label}`);
    }
  }

  confirmDelete(quote: Quote): void { this.deleteTarget.set(quote); }
  cancelDelete(): void              { this.deleteTarget.set(null); }

  async executeDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    const ok = await this.quoteService.delete(target.id);
    if (ok) {
      this.quotes.update((list) => list.filter((q) => q.id !== target.id));
      this.showToast('success', 'Cotización eliminada');
    } else {
      this.showToast('error', 'No se pudo eliminar');
    }
    this.deleteTarget.set(null);
  }

  // ── Anticipo dialog — convert quote to signed contract ────
  openAnticoDialog(quote: Quote): void {
    this.anticoDialog.set(quote);
    this.anticoMonto.set(quote.deposit_amount ?? quote.total);
    this.anticoFecha.set(this.todayStr());
    this.anticoMetodo.set('efectivo');
  }

  closeAnticoDialog(): void {
    this.anticoDialog.set(null);
  }

  // ── Reschedule (conflict resolution for admin) ────────────
  openRescheduleDialog(quote: Quote): void {
    this.rescheduleDialog.set(quote);
    this.rescheduleAvailableDates.set([]);
    void this.loadRescheduleOptions(quote);
  }

  closeRescheduleDialog(): void {
    this.rescheduleDialog.set(null);
  }

  async confirmReschedule(alt: AvailableDate): Promise<void> {
    const quote = this.rescheduleDialog();
    if (!quote || this.rescheduleSaving()) return;
    this.rescheduleSaving.set(true);

    const updated = await this.quoteService.update(quote.id, { fecha_evento: alt.date });
    if (updated) {
      this.quotes.update((list) =>
        list.map((q) => (q.id === quote.id ? { ...q, fecha_evento: alt.date } : q)),
      );
      this.conflictMap.update((m) => { const n = new Map(m); n.delete(quote.id); return n; });
      this.closeRescheduleDialog();
      this.showToast('success', `Fecha cambiada a ${alt.label}`);
    } else {
      this.showToast('error', 'No se pudo actualizar la fecha');
    }
    this.rescheduleSaving.set(false);
  }

  private async loadRescheduleOptions(quote: Quote): Promise<void> {
    this.rescheduleLoadingDates.set(true);
    const venueId = this.venueService.currentVenueId();
    if (!venueId || !quote.hora_inicio) {
      this.rescheduleLoadingDates.set(false);
      return;
    }
    const dates = await this.buildAvailableDatesForQuote(venueId, quote.hora_inicio);
    this.rescheduleAvailableDates.set(dates);
    this.rescheduleLoadingDates.set(false);
  }

  private async checkConflictsForPendingQuotes(quotes: Quote[]): Promise<void> {
    const venueId = this.venueService.currentVenueId();
    if (!venueId) return;
    const today = new Date().toISOString().split('T')[0];
    const pending = quotes.filter(
      (q) =>
        (q.estado === 'borrador' || q.estado === 'enviada') &&
        q.fecha_evento != null &&
        q.fecha_evento >= today &&
        q.hora_inicio != null,
    );
    const results = await Promise.all(
      pending.map(async (q) => {
        const hasConflict = await this.contractService.checkSlotConflict(
          venueId, q.fecha_evento!, q.hora_inicio!, q.hora_fin ?? undefined,
        );
        if (!hasConflict) return null;
        const info = await this.contractService.getConflictingContractInfo(
          venueId, q.fecha_evento!, q.hora_inicio!,
        );
        return info ? { quoteId: q.id, info } : null;
      }),
    );
    const map = new Map<string, { folio: string; cliente: string }>();
    for (const r of results) {
      if (r) map.set(r.quoteId, r.info);
    }
    this.conflictMap.set(map);
  }

  private async buildAvailableDatesForQuote(venueId: string, horaInicio: string): Promise<AvailableDate[]> {
    const today  = new Date();
    const toDate = new Date(today.getTime() + 90 * 86400000);
    const from   = today.toISOString().split('T')[0];
    const to     = toDate.toISOString().split('T')[0];

    const [booked, slots] = await Promise.all([
      this.contractService.getBookedDates(venueId, from, to, horaInicio),
      this.timeSlotService.getActiveSlots(),
    ]);

    const bookedSet  = new Set(booked.map((b) => b.fecha));
    const targetSlot = slots.find((s) => s.start_time === horaInicio) ?? slots[0];
    if (!targetSlot) return [];

    const results: AvailableDate[] = [];
    const cursor = new Date(today.getTime() + 86400000);

    while (results.length < 6 && cursor <= toDate) {
      const iso     = cursor.toISOString().split('T')[0];
      const dow     = cursor.getDay();
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

  goToEvent(contractId: string): void {
    void this.router.navigate(['/admin/evento', contractId]);
  }

  async submitAnticipo(): Promise<void> {
    const quote = this.anticoDialog();
    if (!quote || this.anticoSaving()) return;

    const monto = this.anticoMonto();
    if (monto <= 0) {
      this.showToast('error', 'El monto debe ser mayor a cero');
      return;
    }

    this.anticoSaving.set(true);

    // Validate slot availability before creating the contract
    if (quote.fecha_evento && quote.hora_inicio) {
      const conflict = await this.contractService.checkSlotConflict(
        quote.venue_id,
        quote.fecha_evento,
        quote.hora_inicio,
        quote.hora_fin ?? undefined,
      );
      if (conflict) {
        const fecha = new Date(quote.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' });
        this.showToast('error', `El slot del ${fecha} (${quote.hora_inicio}) ya tiene un contrato activo. Cambia la fecha de la cotización antes de registrar el anticipo.`);
        this.anticoSaving.set(false);
        return;
      }
    }

    const { data: contract, error } = await this.contractService.create({
      venue_id:        quote.venue_id,
      quote_id:        quote.id,
      client_id:       quote.client_id ?? undefined,
      fecha_evento:    quote.fecha_evento ?? this.todayStr(),
      hora_inicio:     quote.hora_inicio ?? undefined,
      hora_fin:        quote.hora_fin ?? undefined,
      salon_renta:     quote.items?.[0]?.precio_unitario ?? 0,
      total_contrato:  quote.total,
      deposito_pagado: 0,
      estado:          'firmado',
      notas:           quote.notas ?? undefined,
    });

    if (error || !contract) {
      this.showToast('error', `No se pudo crear el contrato: ${error?.message || 'Error desconocido'}`);
      this.anticoSaving.set(false);
      return;
    }

    // Register the payment record
    await this.contractService.addPayment(contract.id, {
      monto,
      fecha:  this.anticoFecha(),
      metodo: this.anticoMetodo(),
      tipo:   'anticipo',
      notas:  `Anticipo — cotización ${quote.folio}`,
    });

    // Mark quote as approved
    await this.quoteService.updateStatus(quote.id, 'aprobada');
    this.quotes.update((list) =>
      list.map((q) => (q.id === quote.id ? { ...q, estado: 'aprobada' as QuoteStatus } : q)),
    );

    // Update local map so the event link appears immediately for this quote
    this.contractByQuote.update((m) => new Map(m).set(quote.id, contract.id));

    // Print receipt and navigate to event detail
    const fullContract = await this.contractService.getById(contract.id);
    if (fullContract) {
      const lastPayment = fullContract.payments?.at(-1) ?? null;
      if (lastPayment) {
        this.ticketPrint.printPayment(fullContract, lastPayment, quote);
      }
    }

    this.closeAnticoDialog();
    this.showToast('success', `Contrato ${contract.folio} creado — anticipo registrado`);
    this.anticoSaving.set(false);
    void this.router.navigate(['/admin/evento', contract.id]);
  }

  // ── Send (WhatsApp / Email) ───────────────────────────────
  openSendPanel(quote: Quote): void {
    this.sendTarget.set(quote);
    this.sendMessage.set(this.buildWhatsAppMessage(quote));
  }

  closeSendPanel(): void { this.sendTarget.set(null); }

  sendViaWhatsApp(quote: Quote): void {
    const phone = quote.client?.telefono?.replace(/\D/g, '') ?? '';
    const text = encodeURIComponent(this.sendMessage());
    const url = phone
      ? `https://wa.me/52${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
    void this.markAsSent(quote);
    this.closeSendPanel();
  }

  sendViaEmail(quote: Quote): void {
    const email = quote.client?.email ?? '';
    const subject = encodeURIComponent(`Cotización ${quote.folio} — Hula Hoop`);
    const body = encodeURIComponent(this.buildEmailBody(quote));
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    void this.markAsSent(quote);
    this.closeSendPanel();
  }

  // ── Public link ───────────────────────────────────────────
  getPublicUrl(quote: Quote): string {
    return `${window.location.origin}/cotizacion/${quote.public_token}`;
  }

  copyPublicUrl(quote: Quote): void {
    navigator.clipboard
      .writeText(this.getPublicUrl(quote))
      .then(() => this.showToast('success', 'Link copiado al portapapeles'))
      .catch(() => this.showToast('error', 'No se pudo copiar el link'));
  }

  copyPublicLink(quote: Quote): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const url = `${window.location.origin}/cotizacion/${quote.public_token}`;
    navigator.clipboard.writeText(url).then(() => {
      this.showToast('success', 'Link copiado al portapapeles');
    });
  }

  // ── PDF ───────────────────────────────────────────────────
  downloadPdf(quote: Quote): void {
    const win = window.open('', '_blank');
    if (!win) return;

    const fecha = quote.fecha_evento
      ? new Date(quote.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' })
      : '—';
    const itemRows = (quote.items ?? [])
      .map(
        (it) =>
          `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${it.descripcion}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center">${it.cantidad}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right">$${it.precio_unitario.toLocaleString('es-MX')}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">$${(it.cantidad * it.precio_unitario).toLocaleString('es-MX')}</td>
          </tr>`,
      )
      .join('');

    win.document.write(`<!DOCTYPE html><html lang="es"><head>
      <meta charset="UTF-8">
      <title>Cotización ${quote.folio}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;background:#fff;padding:40px}
        .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:3px solid #E30D1C}
        .logo{font-size:28px;font-weight:800;color:#E30D1C}
        .folio{font-size:18px;font-weight:700;color:#475569}
        .meta{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
        .meta-block h4{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:4px}
        .meta-block p{font-size:15px;font-weight:600;color:#1e293b}
        table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px}
        thead tr{background:#f8fafc}
        thead th{padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
        thead th:last-child,thead th:nth-child(3),thead th:nth-child(2){text-align:right}
        thead th:nth-child(2){text-align:center}
        .totals{width:300px;margin-left:auto}
        .totals tr td{padding:6px 12px;font-size:14px}
        .totals tr td:last-child{text-align:right;font-weight:600}
        .totals .total-row td{font-size:16px;font-weight:800;color:#1e293b;border-top:2px solid #e2e8f0;padding-top:12px}
        .deposit-row td{color:#E30D1C;font-size:15px;font-weight:700}
        .balance-row td{color:#64748b}
        .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center}
        @media print{body{padding:20px}}
      </style>
    </head><body>
      <div class="header">
        <div class="logo">Hula Hoop</div>
        <div style="text-align:right">
          <div class="folio">${quote.folio}</div>
          <div style="font-size:13px;color:#64748b;margin-top:4px">Fecha: ${new Date(quote.fecha + 'T12:00:00').toLocaleDateString('es-MX')}</div>
        </div>
      </div>
      <div class="meta">
        <div class="meta-block">
          <h4>Cliente</h4>
          <p>${quote.client?.nombre ?? 'Sin cliente'}</p>
          ${quote.client?.telefono ? `<p style="font-size:13px;color:#64748b;margin-top:2px">${quote.client.telefono}</p>` : ''}
          ${quote.client?.email ? `<p style="font-size:13px;color:#64748b">${quote.client.email}</p>` : ''}
        </div>
        <div class="meta-block">
          <h4>Evento</h4>
          <p>${fecha}</p>
          ${quote.hora_inicio ? `<p style="font-size:13px;color:#64748b;margin-top:2px">${quote.hora_inicio}${quote.hora_fin ? ' – ' + quote.hora_fin : ''}</p>` : ''}
          ${quote.guest_count ? `<p style="font-size:13px;color:#64748b">${quote.guest_count} invitados</p>` : ''}
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Descripción</th><th style="text-align:center">Cant.</th>
          <th style="text-align:right">Precio unit.</th><th style="text-align:right">Subtotal</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table class="totals">
        <tr><td>Subtotal</td><td>$${quote.subtotal.toLocaleString('es-MX')}</td></tr>
        ${quote.descuento > 0 ? `<tr><td>Descuento</td><td>-$${quote.descuento.toLocaleString('es-MX')}</td></tr>` : ''}
        <tr class="total-row"><td>Total</td><td>$${quote.total.toLocaleString('es-MX')}</td></tr>
        ${(quote.deposit_amount ?? 0) > 0 ? `<tr class="deposit-row"><td>Anticipo requerido</td><td>$${(quote.deposit_amount ?? 0).toLocaleString('es-MX')}</td></tr>` : ''}
        ${(quote.deposit_amount ?? 0) > 0 && (quote.total - (quote.deposit_amount ?? 0)) > 0 ? `<tr class="balance-row"><td>Saldo al evento</td><td>$${(quote.total - (quote.deposit_amount ?? 0)).toLocaleString('es-MX')}</td></tr>` : ''}
      </table>
      ${quote.notas ? `<div style="background:#f8fafc;padding:16px;border-radius:8px;margin-top:16px;font-size:13px"><strong>Notas:</strong> ${quote.notas}</div>` : ''}
      ${(() => {
        const cotizacionUrl = `${window.location.origin}/cotizacion/${quote.public_token}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(cotizacionUrl)}`;
        return `<div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
  <p style="font-size:11px;color:#64748b;margin:0 0 4px;">Accede o paga tu anticipo en línea:</p>
  <p style="font-size:12px;font-weight:600;color:#1e293b;word-break:break-all;margin:0 0 8px;">${cotizacionUrl}</p>
  <img src="${qrUrl}" width="120" height="120" alt="QR" style="display:block;margin:0 auto;" />
</div>`;
      })()}
      <div class="footer">Esta cotización fue generada por Hula Hoop · Válida por 15 días</div>
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  // ── Helpers ───────────────────────────────────────────────
  setStatusFilter(val: QuoteStatus | 'all'): void { this.statusFilter.set(val); }

  formatDate(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  formatDepositLabel(pkg: PartyPackage): string {
    switch (pkg.deposit_type) {
      case 'full':       return 'Pago completo';
      case 'percentage': return `${pkg.deposit_value}% de anticipo`;
      case 'fixed':      return `$${(pkg.deposit_value / 100).toLocaleString('es-MX')} de anticipo`;
    }
  }

  private async markAsSent(quote: Quote): Promise<void> {
    if (quote.estado === 'borrador') {
      const ok = await this.quoteService.updateStatus(quote.id, 'enviada');
      if (ok) {
        this.quotes.update((list) =>
          list.map((q) => (q.id === quote.id ? { ...q, estado: 'enviada' as QuoteStatus } : q)),
        );
      }
    }
  }

  private buildWhatsAppMessage(quote: Quote): string {
    const client = quote.client?.nombre ?? 'Cliente';
    const fecha = quote.fecha_evento
      ? new Date(quote.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' })
      : '';
    const horario = quote.hora_inicio
      ? `${quote.hora_inicio}${quote.hora_fin ? ' – ' + quote.hora_fin : ''}`
      : '';
    const items = (quote.items ?? [])
      .map((it) => `  • ${it.descripcion} x${it.cantidad} — $${(it.cantidad * it.precio_unitario).toLocaleString('es-MX')}`)
      .join('\n');
    const publicUrl = this.getPublicUrl(quote);

    return [
      `Hola ${client}, te comparto tu cotización *${quote.folio}* de Hula Hoop 🎉`,
      '',
      fecha   ? `📅 Fecha evento: ${fecha}` : '',
      horario ? `⏰ Horario: ${horario}` : '',
      quote.guest_count ? `👥 Invitados: ${quote.guest_count}` : '',
      '',
      '📋 *Conceptos:*',
      items,
      '',
      `Subtotal: $${quote.subtotal.toLocaleString('es-MX')}`,
      quote.descuento > 0 ? `Descuento: -$${quote.descuento.toLocaleString('es-MX')}` : '',
      `*Total: $${quote.total.toLocaleString('es-MX')}*`,
      (quote.deposit_amount ?? 0) > 0 ? `*Anticipo requerido: $${(quote.deposit_amount ?? 0).toLocaleString('es-MX')}*` : '',
      '',
      quote.notas ? `📝 Notas: ${quote.notas}` : '',
      '',
      `🔗 Ver tu cotización en línea: ${publicUrl}`,
      '',
      '¿Tienes alguna pregunta? Estamos para ayudarte. 😊',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildEmailBody(quote: Quote): string {
    const client = quote.client?.nombre ?? 'Cliente';
    const fecha = quote.fecha_evento
      ? new Date(quote.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' })
      : '';
    const items = (quote.items ?? [])
      .map((it) => `• ${it.descripcion} x${it.cantidad}: $${(it.cantidad * it.precio_unitario).toLocaleString('es-MX')}`)
      .join('\n');
    const publicUrl = this.getPublicUrl(quote);

    return [
      `Hola ${client},`,
      '',
      `Adjuntamos tu cotización ${quote.folio}:`,
      '',
      fecha ? `Fecha del evento: ${fecha}` : '',
      quote.hora_inicio ? `Horario: ${quote.hora_inicio} – ${quote.hora_fin ?? ''}` : '',
      quote.guest_count ? `Invitados: ${quote.guest_count}` : '',
      '',
      'CONCEPTOS:',
      items,
      '',
      `Subtotal: $${quote.subtotal.toLocaleString('es-MX')}`,
      quote.descuento > 0 ? `Descuento: -$${quote.descuento.toLocaleString('es-MX')}` : '',
      `Total: $${quote.total.toLocaleString('es-MX')}`,
      (quote.deposit_amount ?? 0) > 0 ? `Anticipo requerido: $${(quote.deposit_amount ?? 0).toLocaleString('es-MX')}` : '',
      '',
      `Ver cotización en línea: ${publicUrl}`,
      '',
      quote.notas ? `Notas: ${quote.notas}` : '',
      '',
      'Gracias por su preferencia,',
      'Equipo Hula Hoop',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async refreshQuotes(): Promise<void> {
    const quotes = await this.quoteService.getAll();
    this.quotes.set(quotes);
  }

  private resetWizard(): void {
    this.wizardStep.set(1);
    this.selectedClient.set(null);
    this.clientQuery.set('');
    this.clientDropdownOpen.set(false);
    this.showCreateClient.set(false);
    this.newClientName.set('');
    this.newClientPhone.set('');
    this.newClientEmail.set('');
    this.guestCount.set(10);
    this.selectedDate.set(null);
    this.selectedSlot.set(null);
    this.daySlots.set([]);
    this.selectedPackage.set(null);
    this.selectedSnack.set(null);
    this.skipSnack.set(false);
    this.extraQty.set(new Map());
    this.extraVariant.set(new Map());
    this.discount.set(0);
    this.notes.set('');
    this.editingQuote.set(null);
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 3500);
  }
}
