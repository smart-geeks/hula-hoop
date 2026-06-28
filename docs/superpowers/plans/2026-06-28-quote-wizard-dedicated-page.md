# Quote Wizard — Dedicated Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the right-side drawer wizard for quote creation/editing with a dedicated two-column full-page layout at `/admin/cotizaciones/nueva` and `/admin/cotizaciones/:id/editar`.

**Architecture:** Extract all wizard state and UI from `AdminQuotes` into a new `AdminQuoteWizard` standalone component. The list page navigates to the wizard instead of opening a drawer. On submit, navigate back to `/admin/cotizaciones`. Edit mode is detected from the `:id` route parameter.

**Tech Stack:** Angular 20 zoneless, TypeScript strict, Tailwind CSS, PrimeNG (DatePickerModule, ToggleSwitchModule), CurrencyMxnPipe.

## Global Constraints

- Angular 20 zoneless — NO `NgZone`, NO `ChangeDetectorRef.detectChanges()`
- NO `standalone: true` in `@Component` decorators (default in Angular v20+)
- NO `async ngOnInit()` — constructor + `private async loadXxx()` pattern only
- `ChangeDetectionStrategy.OnPush` on every component
- External template files only — never inline templates
- `inject()` function instead of constructor parameter injection
- Native control flow: `@if`, `@for`, `@switch` — never `*ngIf`, `*ngFor`
- NO `ngClass`, NO `ngStyle` — use `[class.foo]` or `[style.prop]` bindings
- Currency display: always `| currencyMxn` — never `| currency:'MXN':...`
- Signal mutations via `.set()` or `.update()` only — never `.mutate()`
- Build command: `npm run build` — must produce zero NG/TS errors

---

## File Map

| Action | Path |
|---|---|
| CREATE | `src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.ts` |
| CREATE | `src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.html` |
| MODIFY | `src/app/features/admin/admin.routes.ts` |
| MODIFY | `src/app/features/admin/pages/admin-quotes/admin-quotes.ts` |
| MODIFY | `src/app/features/admin/pages/admin-quotes/admin-quotes.html` |

---

## Task 1: Scaffold AdminQuoteWizard + add routes

**Files:**
- Create: `src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.ts`
- Create: `src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.html`
- Modify: `src/app/features/admin/admin.routes.ts`

**Interfaces produced (consumed by Tasks 2–5):**
- `AdminQuoteWizard` class selector: `app-admin-quote-wizard`
- Route paths: `cotizaciones/nueva` and `cotizaciones/:id/editar`

- [ ] **Step 1: Create skeleton TS**

`src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.ts`:

```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';

type WizardStep = 1 | 2 | 3 | 4 | 5;

@Component({
  selector: 'app-admin-quote-wizard',
  templateUrl: './admin-quote-wizard.html',
  imports: [CurrencyMxnPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminQuoteWizard {
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);

  readonly currentStep = signal<WizardStep>(1);
  readonly editMode    = signal(false);
  readonly loading     = signal(false);

  readonly stepLabels: { n: WizardStep; label: string }[] = [
    { n: 1, label: 'Cliente' },
    { n: 2, label: 'Fecha / Hora' },
    { n: 3, label: 'Paquete' },
    { n: 4, label: 'Extras' },
    { n: 5, label: 'Resumen' },
  ];

  constructor() {
    if (this.route.snapshot.params['id']) this.editMode.set(true);
  }

  goBack(): void { void this.router.navigate(['/admin/cotizaciones']); }
  goToStep(n: WizardStep): void { this.currentStep.set(n); }
  prev(): void { const s = this.currentStep(); if (s > 1) this.currentStep.set((s - 1) as WizardStep); }
  next(): void { const s = this.currentStep(); if (s < 5) this.currentStep.set((s + 1) as WizardStep); }
}
```

- [ ] **Step 2: Create skeleton HTML**

`src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.html`:

```html
<div class="min-h-screen bg-slate-50">
  <div class="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
    <nav class="flex items-center gap-2 text-sm" aria-label="Migas de pan">
      <button type="button" (click)="goBack()"
        class="text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors font-medium">
        <i class="pi pi-arrow-left text-xs" aria-hidden="true"></i>
        Cotizaciones
      </button>
      <span class="text-slate-300" aria-hidden="true">/</span>
      <span class="font-semibold text-slate-800">{{ editMode() ? 'Editar cotización' : 'Nueva cotización' }}</span>
    </nav>
  </div>

  <div class="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col lg:flex-row gap-6 items-start">

    <aside class="w-full lg:w-64 shrink-0 lg:sticky lg:top-24 space-y-4">
      <nav class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" aria-label="Pasos">
        @for (step of stepLabels; track step.n) {
          <button type="button" (click)="goToStep(step.n)"
            [attr.aria-current]="currentStep() === step.n ? 'step' : null"
            [class]="'w-full flex items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors border-l-4 '
              + (currentStep() === step.n
                  ? 'border-rojo-brillante bg-red-50 text-rojo-brillante font-semibold'
                  : 'border-transparent text-slate-600 hover:bg-slate-50 font-medium')">
            <span [class]="'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 '
              + (currentStep() === step.n ? 'bg-rojo-brillante text-white' : 'bg-slate-100 text-slate-500')">
              {{ step.n }}
            </span>
            {{ step.label }}
          </button>
        }
      </nav>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Precio estimado</p>
        <p class="text-2xl font-black text-slate-400 mt-2">—</p>
      </div>
    </aside>

    <main class="flex-1 min-w-0 space-y-6">
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8 min-h-96">
        @switch (currentStep()) {
          @case (1) { <p class="text-slate-400 text-sm">Step 1 placeholder</p> }
          @case (2) { <p class="text-slate-400 text-sm">Step 2 placeholder</p> }
          @case (3) { <p class="text-slate-400 text-sm">Step 3 placeholder</p> }
          @case (4) { <p class="text-slate-400 text-sm">Step 4 placeholder</p> }
          @case (5) { <p class="text-slate-400 text-sm">Step 5 placeholder</p> }
        }
      </div>
      <div class="flex justify-between">
        <button type="button" (click)="prev()" [disabled]="currentStep() === 1"
          class="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
          <i class="pi pi-arrow-left text-xs" aria-hidden="true"></i> Anterior
        </button>
        @if (currentStep() < 5) {
          <button type="button" (click)="next()"
            class="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rojo-brillante text-white text-sm font-semibold hover:bg-rojo-brillante/90 transition-colors shadow-sm">
            Siguiente <i class="pi pi-arrow-right text-xs" aria-hidden="true"></i>
          </button>
        }
      </div>
    </main>

  </div>
</div>
```

- [ ] **Step 3: Add routes to admin.routes.ts — insert BEFORE existing `cotizaciones` route**

```typescript
      {
        path: 'cotizaciones/nueva',
        loadComponent: () =>
          import('./pages/admin-quote-wizard/admin-quote-wizard').then((m) => m.AdminQuoteWizard),
        canActivate: [permissionGuard],
        data: { permission: 'cotizaciones:r' }
      },
      {
        path: 'cotizaciones/:id/editar',
        loadComponent: () =>
          import('./pages/admin-quote-wizard/admin-quote-wizard').then((m) => m.AdminQuoteWizard),
        canActivate: [permissionGuard],
        data: { permission: 'cotizaciones:r' }
      },
```

- [ ] **Step 4: Verify build**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | grep -E '(ERROR|✘|Output location)'
```

Expected: `Output location: .../dist/hula-hoop` — zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/admin/pages/admin-quote-wizard/ src/app/features/admin/admin.routes.ts
git commit -m "feat(admin): scaffold AdminQuoteWizard page with two-column layout and routes"
```

---

## Task 2: AdminQuoteWizard — full TypeScript implementation

**Files:**
- Modify: `src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.ts` (full rewrite)

**Context:** The source of truth for all wizard logic is `src/app/features/admin/pages/admin-quotes/admin-quotes.ts`. Read it completely before writing. Wizard signals live at lines 134–198, computed at 218–374, constructor/effect at 376–391, methods at 393–898. This task is a direct extraction — no logic changes, only structural adaptation for the routed page.

Key differences from the drawer version:
1. No `drawerOpen` signal — replaced by route navigation
2. No `editingQuote` reconstructed via `openEdit()` — instead detected from route `params['id']` and loaded in `init()`
3. `onSubmit()` navigates to `/admin/cotizaciones` on success instead of calling `closeDrawer()`
4. Catalog data (packages, extras, clients, etc.) is loaded in this component independently — AdminQuotes will no longer load them

- [ ] **Step 1: Write the complete AdminQuoteWizard TypeScript**

Replace `src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.ts` entirely:

```typescript
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
  imports: [FormsModule, DatePickerModule, ToggleSwitchModule, CurrencyMxnPipe],
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

  readonly activitiesList = signal([
    { id: 'act_a1', group: 'A', name: 'Decora tu galleta',     price_per_person: 0  },
    { id: 'act_a2', group: 'A', name: 'Decora tu cupcake',     price_per_person: 0  },
    { id: 'act_a3', group: 'A', name: 'Decora tu rice krispi', price_per_person: 0  },
    { id: 'act_a4', group: 'A', name: 'Friendship bracelets',  price_per_person: 0  },
    { id: 'act_a5', group: 'A', name: 'Botella sensorial',     price_per_person: 0  },
    { id: 'act_a6', group: 'A', name: 'Capa de superhéroe',    price_per_person: 0  },
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
      ? act.price_per_person * this.guestCount() * 100 : 0;
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
    this.activityUpgradeCents() + this.glamGirlsCents()
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
    }
    this.currentStep.set(5);
  }

  // ── Navigation ───────────────────────────────────────────────
  goBack(): void { void this.router.navigate(['/admin/cotizaciones']); }
  goToStep(n: WizardStep): void { this.currentStep.set(n); }
  prev(): void { const s = this.currentStep(); if (s > 1) this.currentStep.set((s-1) as WizardStep); }
  next(): void {
    const s = this.currentStep();
    if (s === 1 && !this.selectedClient()) { this.showToast('error', 'Debes seleccionar un cliente primero.'); return; }
    if (s === 2 && (!this.selectedDate() || !this.selectedSlot())) { this.showToast('error', 'Debes seleccionar fecha y horario disponible.'); return; }
    if (s === 3 && !this.selectedPackage()) { this.showToast('error', 'Debes seleccionar un paquete.'); return; }
    if (s === 4 && this.selectedCategory() === 'hooping' && !this.selectedActivity()) { this.showToast('error', 'Debes seleccionar una actividad para Hooping.'); return; }
    if (s < 5) this.currentStep.set((s+1) as WizardStep);
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
  selectActivity(act: any): void { this.selectedActivity.set(act); }
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

  // ── Submit ───────────────────────────────────────────────────
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
      if (act.price_per_person > 0) items.push({ descripcion: `Actividad Premium: ${act.name}`, cantidad: this.guestCount(), precio_unitario: act.price_per_person });
      else items.push({ descripcion: `Actividad Incluida: ${act.name}`, cantidad: 1, precio_unitario: 0 });
    }
    if (this.glamGirlsEnabled()) items.push({ descripcion: 'Área Glam Girls (Glitter mani, make up, peinados)', cantidad: this.glamGirlsCount(), precio_unitario: 300 });
    for (const se of this.selectedExtras()) {
      const name  = se.variant ? `${se.extra.name} (${se.variant.name})` : se.extra.name;
      const price = se.variant ? se.variant.price_cents : se.extra.price_cents;
      items.push({ descripcion: se.extra.pay_at_venue ? `${name} (cobro en local)` : name, cantidad: se.quantity, precio_unitario: se.extra.pay_at_venue ? 0 : price / 100 });
    }
    return items;
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 3500);
  }
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | grep -E '(ERROR|✘|Output location)'
```

Expected: zero errors, `Output location: .../dist/hula-hoop`.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.ts
git commit -m "feat(admin-quote-wizard): full TypeScript — all signals, computed, edit mode, submit"
```

---

## Task 3: AdminQuoteWizard HTML — full two-column layout with all 5 steps

**Files:**
- Modify: `src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.html` (full rewrite)

**Context:** The step content (Steps 1–5) must be copied from `src/app/features/admin/pages/admin-quotes/admin-quotes.html`. Read that file first.

Source line ranges in `admin-quotes.html`:
- Step 1 content: lines 299–434 (inside `<p-step-panel [value]="1">`)
- Step 2 content: lines 437–520 (inside `<p-step-panel [value]="2">`)
- Step 3 content: lines 522–633 (inside `<p-step-panel [value]="3">`)
- Step 4 content: lines 635–822 (inside `<p-step-panel [value]="4">`)
- Step 5 content: lines 824–939 (inside `<p-step-panel [value]="5">`)

**Critical rules when copying:**
1. Strip all `<p-step-panel>`, `<ng-template #content let-activateCallback="activateCallback">`, and their closing tags — only paste the inner `<div class="flex flex-col gap-...">` and its contents
2. Remove any `(click)="activateCallback(N)"` calls from Next/navigation buttons that may exist inside steps — navigation is handled by the outer `prev()` / `next()` buttons in the layout below
3. Keep all other template bindings identical — signals, methods, classes are all present in AdminQuoteWizard TS
4. The submit button on Step 5 (if any) should be removed — the outer layout's button calls `onSubmit()`

- [ ] **Step 1: Write the complete HTML**

Replace `admin-quote-wizard.html` entirely with the structure below. The `[PASTE STEP N CONTENT HERE]` markers must be replaced with the actual content copied from `admin-quotes.html` per the line ranges above:

```html
<!-- Toast notification -->
@if (toast()) {
<div role="alert"
  [class]="'fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium '
    + (toast()!.type === 'success'
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        : 'bg-red-50 text-red-700 border border-red-200')">
  <i [class]="'pi ' + (toast()!.type === 'success' ? 'pi-check-circle' : 'pi-times-circle')" aria-hidden="true"></i>
  {{ toast()!.message }}
</div>
}

<div class="min-h-screen bg-slate-50">

  <!-- ── Breadcrumb bar ── -->
  <div class="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
    <nav class="flex items-center gap-2 text-sm" aria-label="Migas de pan">
      <button type="button" (click)="goBack()"
        class="text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors font-medium">
        <i class="pi pi-arrow-left text-xs" aria-hidden="true"></i>
        Cotizaciones
      </button>
      <span class="text-slate-300" aria-hidden="true">/</span>
      <span class="font-semibold text-slate-800">
        @if (editingQuote()) { Editar {{ editingQuote()!.folio }} }
        @else { Nueva cotización }
      </span>
    </nav>
  </div>

  @if (loading()) {
    <div class="flex items-center justify-center py-32">
      <i class="pi pi-spin pi-spinner text-3xl text-slate-400" aria-label="Cargando cotización"></i>
    </div>
  } @else {

  <!-- ── Two-column layout ── -->
  <div class="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col lg:flex-row gap-6 items-start">

    <!-- ══ LEFT SIDEBAR ══════════════════════════════════════ -->
    <aside class="w-full lg:w-64 shrink-0 lg:sticky lg:top-24 space-y-4">

      <!-- Step navigator -->
      <nav class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" aria-label="Pasos de la cotización">
        @for (step of stepLabels; track step.n) {
          <button type="button"
            (click)="goToStep(step.n)"
            [attr.aria-current]="currentStep() === step.n ? 'step' : null"
            [class]="'w-full flex items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors border-l-4 '
              + (currentStep() === step.n
                  ? 'border-rojo-brillante bg-red-50 text-rojo-brillante font-semibold'
                  : 'border-transparent text-slate-600 hover:bg-slate-50 font-medium')">
            <span [class]="'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 '
              + (currentStep() === step.n
                  ? 'bg-rojo-brillante text-white'
                  : 'bg-slate-100 text-slate-500')"
              aria-hidden="true">
              {{ step.n }}
            </span>
            {{ step.label }}
          </button>
        }
      </nav>

      <!-- Live price summary -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3"
           aria-label="Resumen de precio en tiempo real">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Precio estimado</p>

        @if (selectedPackage()) {
          <div class="space-y-1.5 text-sm">
            <div class="flex justify-between text-slate-600">
              <span class="truncate pr-2">Paquete</span>
              <span class="font-medium shrink-0">{{ subtotalCents() / 100 | currencyMxn }}</span>
            </div>
            @if (decorationUpgradeCents() > 0) {
              <div class="flex justify-between text-slate-600">
                <span>Decoración</span>
                <span class="font-medium">{{ decorationUpgradeCents() / 100 | currencyMxn }}</span>
              </div>
            }
            @if (activityUpgradeCents() > 0) {
              <div class="flex justify-between text-slate-600">
                <span>Actividad</span>
                <span class="font-medium">{{ activityUpgradeCents() / 100 | currencyMxn }}</span>
              </div>
            }
            @if (glamGirlsCents() > 0) {
              <div class="flex justify-between text-slate-600">
                <span>Glam Girls</span>
                <span class="font-medium">{{ glamGirlsCents() / 100 | currencyMxn }}</span>
              </div>
            }
            @if (extrasTotalCents() > 0) {
              <div class="flex justify-between text-slate-600">
                <span>Extras</span>
                <span class="font-medium">{{ extrasTotalCents() / 100 | currencyMxn }}</span>
              </div>
            }
            <div class="border-t border-slate-100 pt-2 mt-2 space-y-1">
              @if (discount() > 0) {
                <div class="flex justify-between text-sm text-emerald-600">
                  <span>Descuento</span>
                  <span class="font-medium">-{{ discount() | currencyMxn }}</span>
                </div>
              }
              <div class="flex justify-between items-baseline">
                <span class="font-bold text-slate-800 text-sm">Total</span>
                <span class="font-black text-lg text-rojo-brillante">{{ totalAmount() | currencyMxn }}</span>
              </div>
              @if (depositAmount() > 0) {
                <div class="flex justify-between text-xs text-slate-500">
                  <span>Anticipo</span>
                  <span>{{ depositAmount() | currencyMxn }}</span>
                </div>
              }
            </div>
          </div>
        } @else {
          <p class="text-sm text-slate-400 italic">Selecciona un paquete para ver el precio</p>
        }
      </div>

    </aside>

    <!-- ══ MAIN CONTENT ═══════════════════════════════════════ -->
    <main class="flex-1 min-w-0 space-y-6">

      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">

        @switch (currentStep()) {

          <!-- ─── STEP 1: CLIENTE ─────────────────────── -->
          @case (1) {
            <!-- PASTE content from admin-quotes.html lines 299-434 here -->
            <!-- Strip <p-step-panel>, <ng-template> wrappers, keep inner <div class="flex flex-col gap-6 py-2"> -->
          }

          <!-- ─── STEP 2: FECHA / HORA ────────────────── -->
          @case (2) {
            <!-- PASTE content from admin-quotes.html lines 437-520 here -->
          }

          <!-- ─── STEP 3: PAQUETE ─────────────────────── -->
          @case (3) {
            <!-- PASTE content from admin-quotes.html lines 522-633 here -->
            <!-- Remove any activateCallback() calls -->
          }

          <!-- ─── STEP 4: EXTRAS ──────────────────────── -->
          @case (4) {
            <!-- PASTE content from admin-quotes.html lines 635-822 here -->
          }

          <!-- ─── STEP 5: RESUMEN ─────────────────────── -->
          @case (5) {
            <!-- PASTE content from admin-quotes.html lines 824-939 here -->
            <!-- Remove any "Guardar cotización" button inside — submit is in the nav bar below -->
          }

        }
      </div>

      <!-- ── Navigation buttons ── -->
      <div class="flex justify-between items-center">
        <button type="button" (click)="prev()"
          [disabled]="currentStep() === 1"
          class="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
          <i class="pi pi-arrow-left text-xs" aria-hidden="true"></i>
          Anterior
        </button>

        @if (currentStep() < 5) {
          <button type="button" (click)="next()"
            class="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rojo-brillante text-white text-sm font-semibold hover:bg-rojo-brillante/90 transition-colors shadow-sm">
            Siguiente
            <i class="pi pi-arrow-right text-xs" aria-hidden="true"></i>
          </button>
        } @else {
          <button type="button" (click)="onSubmit()"
            [disabled]="saving()"
            class="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rojo-brillante text-white text-sm font-semibold hover:bg-rojo-brillante/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm">
            @if (saving()) { <i class="pi pi-spin pi-spinner text-xs" aria-hidden="true"></i> }
            {{ editingQuote() ? 'Actualizar cotización' : 'Guardar cotización' }}
          </button>
        }
      </div>

    </main>
  </div>

  }
</div>
```

**Important:** After pasting each step's content, ensure the `@switch`/`@case` blocks are correctly closed. Run the build to catch any template errors.

- [ ] **Step 2: Verify build**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | grep -E '(ERROR|✘|Output location)'
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.html
git commit -m "feat(admin-quote-wizard): implement full two-column HTML with all 5 steps and live price sidebar"
```

---

## Task 4: Strip AdminQuotes — remove drawer, update navigation

**Files:**
- Modify: `src/app/features/admin/pages/admin-quotes/admin-quotes.ts`
- Modify: `src/app/features/admin/pages/admin-quotes/admin-quotes.html`

**Context:** Read both files completely before editing. AdminQuotes keeps: quotes list, status filter, send panel, anticipo dialog, reschedule dialog, delete confirm, conflict detection. It loses: all wizard signals/computed/methods, the drawer HTML block, PrimeNG Stepper/DatePicker/ToggleSwitch imports.

- [ ] **Step 1: Remove WIZARD DRAWER block from HTML**

In `admin-quotes.html`, delete everything from the line containing `<!-- ══ WIZARD DRAWER` through the matching closing `}` of the `@if (drawerOpen())` block (approximately lines 262–945). The send panel and anticipo dialog remain below.

- [ ] **Step 2: Update "Nueva cotización" button in HTML**

Change `(click)="openCreate()"` to keep the same call — `openCreate()` will now navigate (updated in Step 3). No HTML change needed for the button itself.

For the edit pencil button `(click)="openEdit(quote)"` — also no HTML change, method is updated in TS.

- [ ] **Step 3: Update AdminQuotes TypeScript**

**a) Remove these imports** (used only by wizard, now in AdminQuoteWizard):
- `PackageService`, `ExtraService`, `SnackOptionService`, `TimeSlotService`, `ReservationService`
- `StepperModule`, `DatePickerModule`, `ToggleSwitchModule`
- Type imports: `PartyPackage`, `Extra`, `ExtraCategory`, `SnackOption`, `TimeSlot`
- `SlotAvailability`, `AvailableDate` interfaces (if defined locally — check)

Keep: `QuoteService`, `ClientService`, `ContractService`, `VenueService`, `PosTicketPrintService`, `Router`, `PLATFORM_ID`, `isPlatformBrowser`, `FormsModule`, `CurrencyMxnPipe`, `Quote`, `QuoteStatus`, `CreateQuoteData`, `Client`.

**b) Remove signals** (lines ~134–198, all wizard step signals):
- `drawerOpen`, `wizardStep`, `saving`, `editingQuote`
- All Step 1–5 signals: `clientQuery`, `clientDropdownOpen`, `selectedClient`, `guestCount`, `showCreateClient`, `newClientName`, `newClientPhone`, `newClientEmail`, `savingNewClient`, `selectedDate`, `daySlots`, `selectedSlot`, `loadingSlots`, `selectedCategory`, `selectedPackage`, `selectedSnack`, `skipSnack`, `selectedDecoration`, `glamGirlsEnabled`, `glamGirlsCount`, `selectedActivity`, `activeActivityTab`, `activitiesList`, `extraQty`, `extraVariant`, `discount`, `notes`
- Also remove catalog signals: `packages`, `extras`, `snackOptions`, `allSlots`, `allClients`

Keep: `quotes`, `contractByQuote`, `loading`, `statusFilter`, `toast`, `deleteTarget`, `sendTarget`, `sendMessage`, `anticoDialog`, `anticoMonto`, `anticoFecha`, `anticoMetodo`, `anticoSaving`, `conflictMap`, `rescheduleDialog`, `rescheduleAvailableDates`, `rescheduleSaving`, `rescheduleLoadingDates`.

**c) Remove computed signals** no longer needed:
`clientResults`, `filteredPackages`, `isMorningSlot`, `filteredSnackOptions`, `selectedExtras`, `extrasByCategory`, `subtotalCents`, `decorationUpgradeCents`, `activityUpgradeCents`, `glamGirlsCents`, `extrasTotalCents`, `totalCents`, `summaryItems`, `subtotalAmount`, `totalAmount`, `depositAmount`, `balanceDue`, `step1Valid`–`step5Valid`, `minDate`.

Keep: `filteredQuotes`, `statusOptions`, `STATUS_CONFIG`.

**d) Update `loadAll()`** — only loads quotes + contracts now:

```typescript
private async loadAll(): Promise<void> {
  const [quotes, contracts] = await Promise.all([
    this.quoteService.getAll(),
    this.contractService.getAll(),
  ]);
  this.quotes.set(quotes);
  const map = new Map<string, string>();
  for (const c of contracts) { if (c.quote_id) map.set(c.quote_id, c.id); }
  this.contractByQuote.set(map);
  this.loading.set(false);
  void this.checkConflictsForPendingQuotes(quotes);
}
```

**e) Replace `openCreate()` with navigation**:

```typescript
openCreate(): void {
  void this.router.navigate(['/admin/cotizaciones/nueva']);
}
```

**f) Replace `openEdit(quote: Quote)` with navigation**:

```typescript
openEdit(quote: Quote): void {
  void this.router.navigate(['/admin/cotizaciones', quote.id, 'editar']);
}
```

**g) Delete these methods entirely** (now live in AdminQuoteWizard):
`closeDrawer`, `resetWizard`, `onStepChange`, `setCategory`, `toggleGlamGirls`, `updateGlamGirlsCount`, `selectActivity`, `onClientInput`, `selectClient`, `clearClient`, `onGuestCountInput`, `openCreateClient`, `cancelCreateClient`, `submitCreateClient`, `onDateSelect`, `loadSlotsForDate` (private), `selectSlot`, `selectPackage`, `getPackageColor`, `isGuestOutOfRange`, `selectSnack`, `setSkipSnack`, `getExtraQty`, `setExtraQty`, `getExtraVariantId`, `setExtraVariantId`, `buildQuoteItems` (private), `onSubmit`, `refreshQuotes` (private), `formatDateISO`, `formatDateDisplay`, `formatTime`, `isSlotMorning`.

Keep ALL other methods: `changeStatus`, `confirmDelete`, `cancelDelete`, `executeDelete`, `openAnticoDialog`, `closeAnticoDialog`, `submitAnticipo`, `openRescheduleDialog`, `closeRescheduleDialog`, `confirmReschedule`, `loadRescheduleOptions` (private), `checkConflictsForPendingQuotes` (private), `buildAvailableDatesForQuote` (private), `goToEvent`, `openSendPanel`, `closeSendPanel`, `sendViaWhatsApp`, `sendViaEmail`, `getPublicUrl`, `copyPublicUrl`, `copyPublicLink`, `downloadPdf`, `setStatusFilter`, `formatDate`, `formatDepositLabel`, `markAsSent` (private), `buildWhatsAppMessage` (private), `buildEmailBody` (private), `showToast` (private).

Also keep `todayStr` computed signal (used by `submitAnticipo` and `downloadPdf`) and the `PACKAGE_COLOR_HEX` constant (used by `downloadPdf`).

**h) Update `@Component` imports array**:

```typescript
imports: [FormsModule, CurrencyMxnPipe],
```

Remove `StepperModule`, `DatePickerModule`, `ToggleSwitchModule`.

**i) Remove the `AvailableDate` interface export** if it was only used by the wizard. Check if it's imported anywhere else with:

```bash
grep -r "AvailableDate" src/app/ --include="*.ts" | grep -v admin-quotes
```

If used elsewhere, keep the export. If only in admin-quotes, delete it.

Also check `SlotAvailability` the same way:
```bash
grep -r "SlotAvailability" src/app/ --include="*.ts" | grep -v admin-quotes
```

- [ ] **Step 4: Verify build**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | grep -E '(ERROR|✘|Output location)'
```

Expected: zero errors.

- [ ] **Step 5: Verify no stale drawer references**

```bash
grep -n "drawerOpen\|wizardStep\|closeDrawer\|resetWizard\|onStepChange" \
  src/app/features/admin/pages/admin-quotes/admin-quotes.ts \
  src/app/features/admin/pages/admin-quotes/admin-quotes.html 2>/dev/null
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/admin/pages/admin-quotes/admin-quotes.ts \
        src/app/features/admin/pages/admin-quotes/admin-quotes.html
git commit -m "refactor(admin-quotes): remove drawer wizard and update navigation to dedicated wizard page"
```
