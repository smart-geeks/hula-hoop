import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { DatePickerModule } from 'primeng/datepicker';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { QuoteService } from '../../../../core/services/quote.service';
import { ClientService } from '../../../../core/services/client.service';
import { PackageService } from '../../../../core/services/package.service';
import { ExtraService } from '../../../../core/services/extra.service';
import { SnackOptionService } from '../../../../core/services/snack-option.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import { ReservationService } from '../../../../core/services/reservation.service';
import { ContractService } from '../../../../core/services/contract.service';
import { VenueService } from '../../../../core/services/venue.service';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { QuoteDetailComponent } from '../../../../shared/components/quote-detail/quote-detail';
import type { Quote, QuoteStatus, CreateQuoteData } from '../../../../core/interfaces/quote';
import type { Client } from '../../../../core/interfaces/client';
import type { PartyPackage } from '../../../../core/interfaces/package';
import type { Extra, ExtraCategory } from '../../../../core/interfaces/extra';
import type { SnackOption } from '../../../../core/interfaces/snack-option';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

type WizardStep = 1 | 2 | 3 | 4 | 5;

interface SlotAvailability { slot: TimeSlot; blocked: boolean; }

const PACKAGE_COLOR_HEX: Record<string, string> = {
  'lima': '#8CE9AF', 'rosa-pastel': '#EDB2E4', 'azul-cielo': '#85E8E3',
  'morado': '#686ABB', 'rojo-brillante': '#E30D1C', 'naranja': '#FC7632',
  'marron': '#B28B7E', 'amarillo-merengue': '#F6F090',
};

@Component({
  selector: 'app-admin-quote-wizard',
  templateUrl: './admin-quote-wizard.html',
  imports: [FormsModule, DatePickerModule, ToggleSwitchModule, CurrencyMxnPipe, QuoteDetailComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminQuoteWizard {
  private readonly quoteService       = inject(QuoteService);
  private readonly clientService      = inject(ClientService);
  private readonly packageService     = inject(PackageService);
  private readonly extraService       = inject(ExtraService);
  private readonly snackOptionService = inject(SnackOptionService);
  private readonly timeSlotService    = inject(TimeSlotService);
  private readonly reservationService = inject(ReservationService);
  private readonly contractService    = inject(ContractService);
  private readonly venueService       = inject(VenueService);
  private readonly router             = inject(Router);
  private readonly route              = inject(ActivatedRoute);

  // ── Page state ──────────────────────────────────────────────
  readonly currentStep  = signal<WizardStep>(1);
  readonly editMode     = signal(false);
  readonly editingQuote = signal<Quote | null>(null);
  readonly loading      = signal(true);
  readonly saving       = signal(false);
  readonly toast        = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  readonly stepLabels: { n: WizardStep; label: string }[] = [
    { n: 1, label: 'Cliente' },
    { n: 2, label: 'Fecha / Hora' },
    { n: 3, label: 'Paquete' },
    { n: 4, label: 'Extras' },
    { n: 5, label: 'Resumen' },
  ];

  // ── Catalog data ─────────────────────────────────────────────
  readonly allClients   = signal<Client[]>([]);
  readonly packages     = signal<PartyPackage[]>([]);
  readonly extras       = signal<Extra[]>([]);
  readonly snackOptions = signal<SnackOption[]>([]);
  readonly allSlots     = signal<TimeSlot[]>([]);

  private static readonly EXTRA_CATEGORY_ORDER: ExtraCategory[] =
    ['extras', 'hula_munch_bar', 'servicios_adicionales'];
  private static readonly EXTRA_CATEGORY_LABELS: Record<ExtraCategory, string> = {
    extras: 'Extras', hula_munch_bar: 'Hula Munch Bar', servicios_adicionales: 'Servicios Adicionales',
  };

  readonly extrasByCategory = computed(() =>
    AdminQuoteWizard.EXTRA_CATEGORY_ORDER
      .map(cat => ({
        category: cat,
        label: AdminQuoteWizard.EXTRA_CATEGORY_LABELS[cat],
        items: this.extras().filter(e => e.category === cat),
      }))
      .filter(g => g.items.length > 0)
  );

  // ── Step 1 — Cliente ─────────────────────────────────────────
  readonly clientQuery        = signal('');
  readonly clientDropdownOpen = signal(false);
  readonly selectedClient     = signal<Client | null>(null);
  readonly guestCount         = signal<number>(10);
  readonly showCreateClient   = signal(false);
  readonly newClientName      = signal('');
  readonly newClientPhone     = signal('');
  readonly newClientEmail     = signal('');
  readonly savingNewClient    = signal(false);

  // ── Step 2 — Fecha & Horario ─────────────────────────────────
  readonly selectedDate = signal<Date | null>(null);
  readonly daySlots     = signal<SlotAvailability[]>([]);
  readonly selectedSlot = signal<TimeSlot | null>(null);
  readonly loadingSlots = signal(false);

  // ── Step 3 — Paquete & Merienda ──────────────────────────────
  readonly selectedCategory = signal<'hula_hula' | 'hooping'>('hula_hula');
  readonly selectedPackage  = signal<PartyPackage | null>(null);
  readonly selectedSnack    = signal<SnackOption | null>(null);
  readonly skipSnack        = signal(false);

  // ── Step 4 — Experiencias & Extras ───────────────────────────
  readonly selectedDecoration = signal<'petite' | 'grand' | 'plus'>('petite');
  readonly glamGirlsEnabled   = signal(false);
  readonly glamGirlsCount     = signal(5);
  readonly selectedActivity   = signal<any | null>(null);
  readonly activeActivityTab  = signal<'A' | 'B' | 'C'>('A');
  readonly activityParticipantCount = signal<number>(10);

  readonly activitiesList = signal([
    { id: 'act_a1', group: 'A', name: 'Decora tu galleta',     price_per_person: 0  },
    { id: 'act_a2', group: 'A', name: 'Decora tu cupcake',     price_per_person: 0  },
    { id: 'act_a3', group: 'A', name: 'Decora tu rice krispi', price_per_person: 0  },
    { id: 'act_a4', group: 'A', name: 'Friendship bracelets +4 años',  price_per_person: 0  },
    { id: 'act_a5', group: 'A', name: 'Botella sensorial',     price_per_person: 0  },
    { id: 'act_a6', group: 'A', name: 'Decora tu capa superheróe',    price_per_person: 0  },
    { id: 'act_a7', group: 'A', name: 'Decora tu máscara',     price_per_person: 0  },
    { id: 'act_b1', group: 'B', name: 'Ice cream slab',        price_per_person: 60 },
    { id: 'act_b2', group: 'B', name: 'Decora tu pastel',      price_per_person: 65 },
    { id: 'act_b3', group: 'B', name: 'Pinta tu alcancía',     price_per_person: 90 },
    { id: 'act_b4', group: 'B', name: 'Pinta tu canvas',       price_per_person: 80 },
    { id: 'act_c1', group: 'C', name: 'Decora tu peine',       price_per_person: 65 },
    { id: 'act_c2', group: 'C', name: 'Decora tu totebag',     price_per_person: 85 },
    { id: 'act_c3', group: 'C', name: 'Decora tu bucket hat',  price_per_person: 90 },
    { id: 'act_c4', group: 'C', name: 'Decora tu lapicera',    price_per_person: 65 },
    { id: 'act_c5', group: 'C', name: 'Decora tu gorra',       price_per_person: 80 },
  ]);

  readonly extraQty     = signal<Map<string, number>>(new Map());
  readonly extraVariant = signal<Map<string, string>>(new Map());

  // ── Step 4 — Líneas personalizadas ───────────────────────────
  readonly freeLines = signal<{ descripcion: string; cantidad: number; precio_unitario: number }[]>([]);

  readonly freeLinesTotal = computed(() =>
    this.freeLines().reduce((s, l) => s + Math.round(l.cantidad * l.precio_unitario * 100), 0)
  );

  // ── Step 5 — Resumen ─────────────────────────────────────────
  readonly discount = signal(0);
  readonly notes    = signal('');

  // ── Computed ─────────────────────────────────────────────────
  readonly minDate = computed(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0); return now;
  });

  readonly clientResults = computed(() => {
    const q = this.clientQuery().toLowerCase().trim();
    if (!q) return this.allClients().slice(0, 6);
    return this.allClients()
      .filter(c => c.nombre.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.telefono?.includes(q))
      .slice(0, 8);
  });

  readonly filteredPackages = computed(() => {
    const cat = this.selectedCategory();
    return this.packages().filter(p => {
      const isHooping = p.name.toLowerCase().includes('hooping');
      return cat === 'hooping' ? isHooping : !isHooping;
    });
  });

  readonly isMorningSlot = computed(() => {
    const slot = this.selectedSlot();
    return slot ? parseInt(slot.start_time.split(':')[0], 10) < 12 : false;
  });

  readonly filteredSnackOptions = computed(() => {
    const isAM = this.isMorningSlot();
    const amKw = ['chilaquiles', 'molletes', 'croissant', 'crossaint'];
    return this.snackOptions().filter(o => {
      const isAMOpt = amKw.some(k => o.name.toLowerCase().includes(k));
      return isAM ? isAMOpt : !isAMOpt;
    });
  });

  readonly selectedExtras = computed(() => {
    const qty = this.extraQty(); const vars = this.extraVariant();
    return this.extras()
      .filter(e => (qty.get(e.id) ?? 0) > 0)
      .map(e => {
        const quantity = qty.get(e.id)!;
        let variantId = vars.get(e.id);
        if (!variantId && e.variants?.length) variantId = e.variants[0].id;
        return { extra: e, quantity, variant: e.variants?.find(v => v.id === variantId) ?? null };
      });
  });

  readonly subtotalCents          = computed(() => this.selectedPackage()?.price_cents ?? 0);
  readonly decorationUpgradeCents = computed(() => {
    const cat = this.selectedCategory(); const dec = this.selectedDecoration();
    if (cat === 'hula_hula') { if (dec === 'grand') return 140000; if (dec === 'plus') return 270000; }
    if (cat === 'hooping'  ) { if (dec === 'plus')  return 130000; }
    return 0;
  });
  readonly activityUpgradeCents = computed(() => {
    const act = this.selectedActivity();
    return this.selectedCategory() === 'hooping' && act?.price_per_person
      ? act.price_per_person * this.activityParticipantCount() * 100 : 0;
  });
  readonly glamGirlsCents   = computed(() => this.glamGirlsEnabled() ? this.glamGirlsCount() * 30000 : 0);
  readonly extrasTotalCents = computed(() =>
    this.selectedExtras().reduce((s, se) => {
      if (se.extra.pay_at_venue) return s;
      return s + (se.variant ? se.variant.price_cents : se.extra.price_cents) * se.quantity;
    }, 0)
  );
  readonly totalCents     = computed(() =>
    this.subtotalCents() + this.extrasTotalCents() + this.decorationUpgradeCents() +
    this.activityUpgradeCents() + this.glamGirlsCents() + this.freeLinesTotal()
  );
  readonly subtotalAmount = computed(() => this.totalCents() / 100);
  readonly totalAmount    = computed(() => Math.max(0, this.subtotalAmount() - this.discount()));
  readonly depositAmount  = computed(() => {
    const pkg = this.selectedPackage(); if (!pkg) return 0;
    const t = this.totalAmount();
    if (pkg.deposit_type === 'full')       return t;
    if (pkg.deposit_type === 'percentage') return Math.round(t * pkg.deposit_value) / 100;
    return Math.min(pkg.deposit_value / 100, t);
  });
  readonly balanceDue    = computed(() => Math.max(0, this.totalAmount() - this.depositAmount()));
  readonly summaryItems  = computed(() => this.buildQuoteItems());

  readonly summaryQuote = computed((): Quote => {
    const client = this.selectedClient();
    const slot   = this.selectedSlot();
    const date   = this.selectedDate();
    const items  = this.summaryItems().map((item, i) => ({
      id:              `preview-${i}`,
      quote_id:        'preview',
      descripcion:     item.descripcion,
      cantidad:        item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal:        item.cantidad * item.precio_unitario,
    }));
    return {
      id:               'preview',
      venue_id:         '',
      folio:            this.editingQuote()?.folio ?? 'Nueva cotización',
      public_token:     '',
      client_id:        client?.id ?? null,
      fecha:            this.todayStr(),
      fecha_evento:     date ? this.formatDateISO(date) : null,
      hora_inicio:      slot?.start_time ?? null,
      hora_fin:         slot?.end_time ?? null,
      guest_count:      this.guestCount(),
      estado:           this.editingQuote()?.estado ?? 'borrador',
      subtotal:         this.subtotalCents() / 100,
      descuento:        this.discount(),
      total:            this.totalAmount(),
      deposit_amount:   this.depositAmount() > 0 ? this.depositAmount() : null,
      time_slot_id:     null,
      mp_preference_id: null,
      snack_option_id:  null,
      package_id:       null,
      notas:            this.notes() || null,
      created_at:       '',
      client:           client ? { nombre: client.nombre, email: client.email ?? null, telefono: client.telefono ?? null } : undefined,
      items,
    };
  });

  readonly step1Valid    = computed(() => this.selectedClient() !== null);
  readonly step2Valid    = computed(() => !!this.selectedDate() && this.selectedSlot() !== null);
  readonly step3Valid    = computed(() => this.selectedPackage() !== null);
  readonly step4Valid    = computed(() => this.selectedCategory() === 'hooping' ? this.selectedActivity() !== null : true);
  readonly todayStr      = computed(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });

  constructor() {
    effect(() => {
      const snack = this.selectedSnack();
      if (!snack) return;
      const amKw = ['chilaquiles', 'molletes', 'croissant', 'crossaint'];
      const isAMOpt = amKw.some(k => snack.name.toLowerCase().includes(k));
      if (this.isMorningSlot() !== isAMOpt) this.selectedSnack.set(null);
    }, { allowSignalWrites: true });

    effect(() => {
      const guests = this.guestCount();
      const currentParticipants = this.activityParticipantCount();
      if (currentParticipants > guests) {
        this.activityParticipantCount.set(guests);
      }
    }, { allowSignalWrites: true });

    this.init();
  }

  private async init(): Promise<void> {
    const id = this.route.snapshot.params['id'];
    if (id) this.editMode.set(true);

    const [clients, packages, extras, snacks, slots] = await Promise.all([
      this.clientService.getAll(),
      this.packageService.getActivePackages(),
      this.extraService.getActiveExtras(),
      this.snackOptionService.getActiveSnackOptions(),
      this.timeSlotService.getActiveSlots(),
    ]);
    this.allClients.set(clients);
    this.packages.set(packages);
    this.extras.set(extras);
    this.snackOptions.set(snacks);
    this.allSlots.set(slots);

    if (id) {
      const quote = await this.quoteService.getById(id);
      if (quote) { this.populateFromQuote(quote); }
      else {
        this.showToast('error', 'No se encontró la cotización');
        void this.router.navigate(['/admin/cotizaciones']);
        return;
      }
    }
    this.loading.set(false);
  }

  private populateFromQuote(quote: Quote): void {
    this.freeLines.set([]);
    this.editingQuote.set(quote);
    this.selectedClient.set(this.allClients().find(c => c.id === quote.client_id) ?? null);
    this.guestCount.set(quote.guest_count ?? 10);
    if (quote.fecha_evento) {
      this.selectedDate.set(new Date(quote.fecha_evento + 'T12:00:00'));
      void this.loadSlotsForDate(quote.fecha_evento, quote.hora_inicio ?? undefined);
    }
    this.discount.set(quote.descuento ?? 0);
    this.notes.set(quote.notas ?? '');
    if (quote.package_id) this.selectedPackage.set(this.packages().find(p => p.id === quote.package_id) ?? null);
    if (quote.snack_option_id) this.selectedSnack.set(this.snackOptions().find(s => s.id === quote.snack_option_id) ?? null);
    else this.skipSnack.set(true);

    if (quote.items) {
      const pkg = this.selectedPackage();
      let cat: 'hula_hula' | 'hooping' = pkg?.name.toLowerCase().includes('hooping') ? 'hooping' : 'hula_hula';
      let dec: 'petite' | 'grand' | 'plus' = 'petite';
      let act: any = null; let glamEnabled = false; let glamCount = 5;
      const extQty = new Map<string, number>(); const extVar = new Map<string, string>();

      for (const item of quote.items) {
        const d = item.descripcion;
        if (d.startsWith('Upgrade de Decoración:')) {
          const t = d.split(':').pop()?.trim().toLowerCase();
          if (t === 'grand') dec = 'grand'; if (t === 'plus') dec = 'plus';
        }
        if (d.startsWith('Actividad Premium:') || d.startsWith('Actividad Incluida:')) {
          cat = 'hooping';
          const aName = d.split(':').pop()?.trim();
          const found = this.activitiesList().find(a => a.name === aName);
          if (found) act = found;
          this.activityParticipantCount.set(item.cantidad);
        }
        if (d.startsWith('Área Glam Girls')) { glamEnabled = true; glamCount = item.cantidad; }
        const me = this.extras().find(e => d === e.name || d === `${e.name} (cobro en local)`);
        if (me) { extQty.set(me.id, item.cantidad); }
        else {
          for (const e of this.extras()) {
            if (e.variants?.length) {
              const mv = e.variants.find(v => { const vd = `${e.name} (${v.name})`; return d === vd || d === `${vd} (cobro en local)`; });
              if (mv) { extQty.set(e.id, item.cantidad); extVar.set(e.id, mv.id); break; }
            }
          }
        }
      }
      if (cat === 'hooping' && dec === 'petite') dec = 'grand';
      this.selectedCategory.set(cat); this.selectedDecoration.set(dec); this.selectedActivity.set(act);
      this.glamGirlsEnabled.set(glamEnabled); this.glamGirlsCount.set(glamCount);
      this.extraQty.set(extQty); this.extraVariant.set(extVar);

      // Collect unmatched items as free lines
      const KNOWN_PREFIXES = [
        'Merienda:', 'Upgrade de Decoración:', 'Actividad Premium:',
        'Actividad Incluida:', 'Área Glam Girls',
      ];
      const matchedDescs = new Set<string>([
        ...(this.selectedPackage() ? [this.selectedPackage()!.name] : []),
        ...[...extQty.keys()].flatMap(id => {
          const e = this.extras().find(x => x.id === id);
          if (!e) return [];
          const vid = extVar.get(id);
          const vname = vid ? e.variants?.find(v => v.id === vid)?.name : undefined;
          return vname
            ? [`${e.name} (${vname})`, `${e.name} (${vname}) (cobro en local)`]
            : [e.name, `${e.name} (cobro en local)`];
        }),
      ]);

      const recovered = quote.items
        .filter(item => {
          const d = item.descripcion;
          if (KNOWN_PREFIXES.some(p => d.startsWith(p))) return false;
          return !matchedDescs.has(d);
        })
        .map(item => ({
          descripcion:     item.descripcion,
          cantidad:        item.cantidad,
          precio_unitario: item.precio_unitario,
        }));

      this.freeLines.set(recovered);
    }
    this.currentStep.set(5);
  }

  // ── Navigation ───────────────────────────────────────────────
  goBack(): void { void this.router.navigate(['/admin/cotizaciones']); }
  goToStep(n: WizardStep): void { this.currentStep.set(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  prev(): void { const s = this.currentStep(); if (s > 1) { this.currentStep.set((s-1) as WizardStep); window.scrollTo({ top: 0, behavior: 'smooth' }); } }
  next(): void {
    const s = this.currentStep();
    if (s === 1 && !this.selectedClient()) { this.showToast('error', 'Debes seleccionar un cliente primero.'); return; }
    if (s === 2 && (!this.selectedDate() || !this.selectedSlot())) { this.showToast('error', 'Debes seleccionar fecha y horario disponible.'); return; }
    if (s === 3 && !this.selectedPackage()) { this.showToast('error', 'Debes seleccionar un paquete.'); return; }
    if (s === 4 && this.selectedCategory() === 'hooping' && !this.selectedActivity()) { this.showToast('error', 'Debes seleccionar una actividad para Hooping.'); return; }
    if (s < 5) { this.currentStep.set((s+1) as WizardStep); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  // ── Step 1 ───────────────────────────────────────────────────
  onClientInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.clientQuery.set(val); this.clientDropdownOpen.set(true); this.showCreateClient.set(false);
    if (!val) this.selectedClient.set(null);
  }
  selectClient(client: Client): void {
    this.selectedClient.set(client); this.clientQuery.set('');
    this.clientDropdownOpen.set(false); this.showCreateClient.set(false);
  }
  clearClient(): void { this.selectedClient.set(null); this.clientQuery.set(''); this.showCreateClient.set(false); }
  onGuestCountInput(event: Event): void {
    const val = +(event.target as HTMLInputElement).value;
    this.guestCount.set(isNaN(val) ? 1 : Math.max(1, val));
  }
  openCreateClient(): void {
    this.showCreateClient.set(true); this.newClientName.set(this.clientQuery().trim());
    this.newClientPhone.set(''); this.newClientEmail.set(''); this.clientDropdownOpen.set(false);
  }
  cancelCreateClient(): void {
    this.showCreateClient.set(false); this.newClientName.set(''); this.newClientPhone.set(''); this.newClientEmail.set('');
  }
  async submitCreateClient(): Promise<void> {
    const name = this.newClientName().trim();
    if (!name || this.savingNewClient()) return;
    this.savingNewClient.set(true);
    const created = await this.clientService.create({
      nombre: name, telefono: this.newClientPhone().trim() || undefined, email: this.newClientEmail().trim() || undefined,
    });
    if (created) {
      this.allClients.update(list => [...list, created].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.selectClient(created); this.cancelCreateClient();
      this.showToast('success', `Cliente "${created.nombre}" creado`);
    } else { this.showToast('error', 'No se pudo crear el cliente'); }
    this.savingNewClient.set(false);
  }

  // ── Step 2 ───────────────────────────────────────────────────
  async onDateSelect(date: Date): Promise<void> {
    this.selectedDate.set(date); this.selectedSlot.set(null);
    if (date) await this.loadSlotsForDate(this.formatDateISO(date));
  }
  private async loadSlotsForDate(date: string, preselectedStart?: string): Promise<void> {
    this.loadingSlots.set(true);
    const venueId = this.venueService.currentVenueId();
    const d = new Date(date + 'T12:00:00');
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const dayType = isWeekend ? 'weekend' : 'weekday';
    const slotsForDay = this.allSlots().filter(s => s.day_type === dayType);
    const results: SlotAvailability[] = await Promise.all(
      slotsForDay.map(async slot => {
        const [bp, bc] = await Promise.all([
          this.reservationService.isSlotBlockedByPrivate(date, slot.id),
          venueId ? this.contractService.checkSlotConflict(venueId, date, slot.start_time, slot.end_time) : Promise.resolve(false),
        ]);
        return { slot, blocked: bp || bc };
      })
    );
    this.daySlots.set(results);
    if (preselectedStart) {
      const match = results.find(r => r.slot.start_time === preselectedStart);
      if (match && !match.blocked) this.selectedSlot.set(match.slot);
    }
    this.loadingSlots.set(false);
  }
  selectSlot(a: SlotAvailability): void { if (!a.blocked) this.selectedSlot.set(a.slot); }

  // ── Step 3 ───────────────────────────────────────────────────
  setCategory(cat: 'hula_hula' | 'hooping'): void {
    this.selectedCategory.set(cat);
    if (cat === 'hula_hula') { this.selectedActivity.set(null); this.selectedDecoration.set('petite'); }
    else { this.selectedDecoration.set('grand'); }
  }
  selectPackage(pkg: PartyPackage): void { this.selectedPackage.set(pkg); }
  getPackageColor(pkg: PartyPackage): string { return pkg.color ? PACKAGE_COLOR_HEX[pkg.color] ?? '#E30D1C' : '#E30D1C'; }
  isGuestOutOfRange(pkg: PartyPackage): boolean { const g = this.guestCount(); return g < pkg.min_guests || g > pkg.max_guests; }
  selectSnack(snack: SnackOption): void { this.selectedSnack.set(snack); this.skipSnack.set(false); }
  setSkipSnack(): void { this.selectedSnack.set(null); this.skipSnack.set(true); }

  // ── Step 4 ───────────────────────────────────────────────────
  toggleGlamGirls(val: boolean): void { this.glamGirlsEnabled.set(val); if (!val) this.glamGirlsCount.set(5); }
  updateGlamGirlsCount(qty: number): void { this.glamGirlsCount.set(Math.max(5, qty)); }
  selectActivity(act: any): void {
    this.selectedActivity.set(act);
    this.activityParticipantCount.set(this.guestCount());
  }

  onActivityParticipantCountInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    if (!raw) return;
    const val = parseInt(raw, 10);
    if (isNaN(val)) return;
    const guests = this.guestCount();
    this.activityParticipantCount.set(Math.min(guests, Math.max(1, val)));
  }

  onActivityParticipantCountBlur(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const val = parseInt(raw, 10);
    const guests = this.guestCount();
    const clean = isNaN(val) ? 1 : Math.min(guests, Math.max(1, val));
    this.activityParticipantCount.set(clean);
    (event.target as HTMLInputElement).value = String(clean);
  }
  getExtraQty(extraId: string): number { return this.extraQty().get(extraId) ?? 0; }
  setExtraQty(extraId: string, delta: number): void {
    const map = new Map(this.extraQty());
    const next = Math.max(0, (map.get(extraId) ?? 0) + delta);
    if (next === 0) map.delete(extraId); else map.set(extraId, next);
    this.extraQty.set(map);
  }
  getExtraVariantId(extraId: string): string {
    const vid = this.extraVariant().get(extraId);
    if (vid) return vid;
    return this.extras().find(e => e.id === extraId)?.variants?.[0]?.id ?? '';
  }
  setExtraVariantId(extraId: string, variantId: string): void {
    const map = new Map(this.extraVariant()); map.set(extraId, variantId); this.extraVariant.set(map);
  }

  addFreeLine(): void {
    this.freeLines.update(l => [...l, { descripcion: '', cantidad: 1, precio_unitario: 0 }]);
  }

  removeFreeLine(i: number): void {
    this.freeLines.update(l => l.filter((_, idx) => idx !== i));
  }

  updateFreeLine(i: number, field: 'descripcion' | 'cantidad' | 'precio_unitario', value: string): void {
    this.freeLines.update(l =>
      l.map((line, idx) =>
        idx === i
          ? { ...line, [field]: field === 'descripcion' ? value : Math.max(0, parseFloat(value) || 0) }
          : line
      )
    );
  }

  // ── Submit ───────────────────────────────────────────────────
  async onSubmit(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    const payload: CreateQuoteData = {
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
      items:           this.summaryItems().map(it => ({
        descripcion: it.descripcion, cantidad: it.cantidad, precio_unitario: it.precio_unitario,
      })),
    };
    const editing = this.editingQuote();
    const result  = editing
      ? await this.quoteService.updateFull(editing.id, payload)
      : await this.quoteService.create(payload);
    this.saving.set(false);
    if (result) { void this.router.navigate(['/admin/cotizaciones']); }
    else { this.showToast('error', 'Ocurrió un error. Intenta de nuevo.'); }
  }

  // ── Helpers ──────────────────────────────────────────────────
  formatDateISO(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  formatDateDisplay(date: Date): string {
    return date.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  formatTime(time: string): string {
    const [h, m] = time.split(':'); const hour = parseInt(h, 10);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  }
  isSlotMorning(slot: TimeSlot): boolean { return parseInt(slot.start_time.split(':')[0], 10) < 12; }

  private buildQuoteItems(): CreateQuoteData['items'] {
    const items: CreateQuoteData['items'] = [];
    const pkg = this.selectedPackage();
    if (pkg) items.push({ descripcion: pkg.name, cantidad: 1, precio_unitario: pkg.price_cents / 100 });
    const snack = this.selectedSnack();
    if (snack && !this.skipSnack()) items.push({ descripcion: `Merienda: ${snack.name}`, cantidad: 1, precio_unitario: 0 });
    const decUp = this.decorationUpgradeCents();
    if (decUp > 0) items.push({ descripcion: `Upgrade de Decoración: ${this.selectedDecoration().toUpperCase()}`, cantidad: 1, precio_unitario: decUp / 100 });
    const cat = this.selectedCategory(); const act = this.selectedActivity();
    if (cat === 'hooping' && act) {
      if (act.price_per_person > 0) items.push({ descripcion: `Actividad Premium: ${act.name}`, cantidad: this.activityParticipantCount(), precio_unitario: act.price_per_person });
      else items.push({ descripcion: `Actividad Incluida: ${act.name}`, cantidad: 1, precio_unitario: 0 });
    }
    if (this.glamGirlsEnabled()) items.push({ descripcion: 'Área Glam Girls (Glitter mani, make up, peinados)', cantidad: this.glamGirlsCount(), precio_unitario: 300 });
    for (const se of this.selectedExtras()) {
      const name  = se.variant ? `${se.extra.name} (${se.variant.name})` : se.extra.name;
      const price = se.variant ? se.variant.price_cents : se.extra.price_cents;
      items.push({ descripcion: se.extra.pay_at_venue ? `${name} (cobro en local)` : name, cantidad: se.quantity, precio_unitario: se.extra.pay_at_venue ? 0 : price / 100 });
    }
    // Free/custom lines
    for (const line of this.freeLines()) {
      if (line.descripcion.trim()) {
        items.push({
          descripcion:     line.descripcion.trim(),
          cantidad:        line.cantidad,
          precio_unitario: line.precio_unitario,
        });
      }
    }
    return items;
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 3500);
  }
}
