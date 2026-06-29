# Unified Quote View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a shared `QuoteDetailComponent` used in wizard Step 5 and the event "Cotización" tab, add free-line items to the wizard, and make quote rows clickable in the list.

**Architecture:** One new shared display component (`QuoteDetailComponent`) replaces the current view HTML in the wizard summary and the event detail tab. The wizard gains a `freeLines` signal for custom items in Step 4. Clicking a quote row in the list navigates to the existing `/admin/cotizaciones/:id/editar` route (wizard loads quote and jumps to Step 5). No new routes or pages needed.

**Tech Stack:** Angular 20 zoneless, TypeScript strict, Tailwind CSS, Supabase.

## Global Constraints

- Angular 20 zoneless — NO `NgZone`, NO `ChangeDetectorRef.detectChanges()`
- NO `standalone: true` in any `@Component` decorator (default in Angular v20+)
- Constructor + `private async init()` — NEVER `async ngOnInit()`
- `ChangeDetectionStrategy.OnPush` on all components
- External template files only — NEVER inline templates in TS
- `inject()` for DI — no constructor injection
- `@if`, `@for`, `@switch` — never `*ngIf`, `*ngFor`, `*ngSwitch`
- NO `ngClass`, NO `ngStyle` — use `[class.foo]` or `[class]` bindings
- No arrow functions in templates
- Quote amounts are in **pesos** — use `| currency:'MXN':'symbol-narrow':'1.0-0'` (NOT `| currencyMxn` which expects cents)
- `input()` / `input.required()` functions — not `@Input()` decorator
- Signal mutations via `.set()` or `.update()` — never `.mutate()`

---

## File Map

| Action | Path |
|---|---|
| CREATE | `src/app/shared/components/quote-detail/quote-detail.ts` |
| CREATE | `src/app/shared/components/quote-detail/quote-detail.html` |
| MODIFY | `src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.ts` |
| MODIFY | `src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.html` |
| MODIFY | `src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts` |
| MODIFY | `src/app/features/admin/pages/admin-event-detail/admin-event-detail.html` |
| MODIFY | `src/app/features/admin/pages/admin-quotes/admin-quotes.html` |

---

## Task 1: `QuoteDetailComponent`

**Files:**
- Create: `src/app/shared/components/quote-detail/quote-detail.ts`
- Create: `src/app/shared/components/quote-detail/quote-detail.html`

**Interfaces:**
- Consumes: `Quote`, `QuoteItem` from `src/app/core/interfaces/quote.ts`; `Contract` from `src/app/core/interfaces/contract.ts`
- Produces:
  - Selector: `app-quote-detail`
  - `quote = input.required<Quote>()` — quote with `.items` and `.client` relations loaded
  - `contract = input<Contract | null>(null)` — optional, enables contract status section; `.payments` must be loaded

- [ ] **Step 1: Create the TypeScript component**

Create `src/app/shared/components/quote-detail/quote-detail.ts`:

```typescript
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import type { Quote, QuoteItem } from '../../../core/interfaces/quote';
import type { Contract } from '../../../core/interfaces/contract';

interface ItemGroup {
  label: string;
  items: Array<{ raw: QuoteItem; cleanDesc: string }>;
}

@Component({
  selector: 'app-quote-detail',
  templateUrl: './quote-detail.html',
  imports: [CurrencyPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteDetailComponent {
  readonly quote    = input.required<Quote>();
  readonly contract = input<Contract | null>(null);

  readonly itemGroups = computed<ItemGroup[]>(() => {
    const items = this.quote().items ?? [];
    if (!items.length) return [];

    const PREFIXES: [string, string][] = [
      ['Merienda:',              'Merienda'],
      ['Upgrade de Decoración:', 'Decoración'],
      ['Actividad Premium:',     'Experiencia'],
      ['Actividad Incluida:',    'Experiencia'],
      ['Área Glam Girls',        'Glam Girls'],
    ];

    const clean = (d: string): string =>
      PREFIXES.reduce((s, [p]) => (s.startsWith(p) ? s.slice(p.length).trim() : s), d);

    const categorize = (d: string): string => {
      for (const [p, c] of PREFIXES) { if (d.startsWith(p)) return c; }
      return '__raw__';
    };

    const map = new Map<string, Array<{ raw: QuoteItem; cleanDesc: string }>>();
    let firstRaw = true;
    for (const item of items) {
      const cat = categorize(item.descripcion);
      const label = cat === '__raw__' ? (firstRaw ? (firstRaw = false, 'Paquete') : 'Extras') : cat;
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push({ raw: item, cleanDesc: clean(item.descripcion) });
    }

    const ORDER = ['Paquete', 'Merienda', 'Decoración', 'Experiencia', 'Glam Girls', 'Extras'];
    return ORDER.filter(k => map.has(k)).map(k => ({ label: k, items: map.get(k)! }));
  });

  readonly saldoContrato = computed(() => {
    const c = this.contract();
    if (!c) return null;
    const paid = (c.payments ?? []).reduce((s, p) => s + p.monto, 0);
    return { paid, saldo: c.total_contrato - paid };
  });

  readonly depositBalance = computed(() => {
    const q = this.quote();
    const dep = q.deposit_amount ?? 0;
    if (dep <= 0) return null;
    return { deposit: dep, balance: q.total - dep };
  });
}
```

- [ ] **Step 2: Create the HTML template**

Create `src/app/shared/components/quote-detail/quote-detail.html`:

```html
<div class="space-y-5">

  <!-- ① Cabecera -->
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <p class="text-xs text-slate-400 mb-0.5 uppercase tracking-wide">Cotización</p>
        <p class="text-2xl font-bold text-slate-800 font-mono">{{ quote().folio }}</p>
        <p class="text-sm text-slate-400 mt-1">Emitida el {{ quote().fecha | date:'d MMM yyyy':'':'es-MX' }}</p>
      </div>
      <span [class]="'px-3 py-1.5 rounded-full text-xs font-semibold ' + statusClass()">
        {{ statusLabel() }}
      </span>
    </div>
  </div>

  <!-- ② Cliente + Evento -->
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm grid grid-cols-1 gap-6 md:grid-cols-2">
    <!-- Cliente -->
    <div>
      <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Cliente</p>
      @if (quote().client; as c) {
        <p class="font-semibold text-slate-800 text-sm">{{ c.nombre }}</p>
        @if (c.telefono) {
          <p class="text-sm text-slate-500 mt-1"><i class="pi pi-phone text-xs mr-1" aria-hidden="true"></i>{{ c.telefono }}</p>
        }
        @if (c.email) {
          <p class="text-sm text-slate-500 mt-1"><i class="pi pi-envelope text-xs mr-1" aria-hidden="true"></i>{{ c.email }}</p>
        }
      } @else {
        <p class="text-sm text-slate-400 italic">Sin cliente asignado</p>
      }
    </div>
    <!-- Evento -->
    <div>
      <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Evento</p>
      @if (quote().fecha_evento) {
        <p class="font-semibold text-slate-800 text-sm">{{ quote().fecha_evento | date:'EEEE d \'de\' MMMM yyyy':'':'es-MX' }}</p>
      } @else {
        <p class="text-sm text-slate-400 italic">Sin fecha asignada</p>
      }
      @if (quote().hora_inicio) {
        <p class="text-sm text-slate-500 mt-1">
          <i class="pi pi-clock text-xs mr-1" aria-hidden="true"></i>
          {{ quote().hora_inicio }}{{ quote().hora_fin ? ' – ' + quote().hora_fin : '' }}
        </p>
      }
      @if (quote().guest_count) {
        <p class="text-sm text-slate-500 mt-1">
          <i class="pi pi-users text-xs mr-1" aria-hidden="true"></i>
          {{ quote().guest_count }} invitados
        </p>
      }
    </div>
  </div>

  <!-- ③ Conceptos por categoría -->
  @if (itemGroups().length > 0) {
  <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
    @for (group of itemGroups(); track group.label) {
    <div>
      <div class="px-6 py-3 bg-slate-50 border-b border-slate-100">
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">{{ group.label }}</p>
      </div>
      <div class="divide-y divide-slate-50">
        @for (entry of group.items; track entry.raw.id) {
        <div class="flex items-start justify-between px-6 py-4 text-sm gap-4">
          <div class="flex-1 min-w-0">
            <p class="font-medium text-slate-800">{{ entry.cleanDesc }}</p>
            @if (entry.raw.cantidad > 1) {
              <p class="text-xs text-slate-400 mt-0.5">{{ entry.raw.cantidad }} × {{ entry.raw.precio_unitario | currency:'MXN':'symbol-narrow':'1.0-0' }}</p>
            }
          </div>
          <div class="shrink-0 text-right">
            @if (entry.raw.precio_unitario === 0) {
              <span class="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Incluido</span>
            } @else {
              <p class="font-semibold text-slate-700">{{ entry.raw.subtotal | currency:'MXN':'symbol-narrow':'1.0-0' }}</p>
            }
          </div>
        </div>
        }
      </div>
    </div>
    }
  </div>
  }

  <!-- ④ Totales -->
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
    <p class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Totales</p>
    <div class="space-y-2 text-sm">
      <div class="flex justify-between text-slate-600">
        <span>Subtotal</span>
        <span>{{ quote().subtotal | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
      </div>
      @if (quote().descuento > 0) {
      <div class="flex justify-between text-emerald-600">
        <span>Descuento</span>
        <span>− {{ quote().descuento | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
      </div>
      }
      <div class="border-t border-slate-100 pt-2 flex justify-between text-base font-bold text-slate-800">
        <span>Total</span>
        <span>{{ quote().total | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
      </div>
      @if (depositBalance(); as db) {
      <div class="flex justify-between font-semibold text-rojo-brillante">
        <span>Anticipo requerido</span>
        <span>{{ db.deposit | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
      </div>
      <div class="flex justify-between text-slate-500">
        <span>Saldo al evento</span>
        <span>{{ db.balance | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
      </div>
      }
    </div>
  </div>

  <!-- ⑤ Notas -->
  @if (quote().notas) {
  <div class="bg-slate-50 border border-slate-200 rounded-2xl p-5">
    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Notas</p>
    <p class="text-sm text-slate-700">{{ quote().notas }}</p>
  </div>
  }

  <!-- ⑥ Estado del contrato (solo si se pasa contract) -->
  @if (contract(); as c) {
  <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
    <p class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Contrato</p>
    <div class="space-y-2 text-sm">
      <div class="flex justify-between">
        <span class="text-slate-500">Total del contrato</span>
        <span class="font-medium">{{ c.total_contrato | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
      </div>
      @if (saldoContrato(); as sc) {
      <div class="flex justify-between">
        <span class="text-slate-500">Pagado</span>
        <span class="font-medium text-emerald-600">{{ sc.paid | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
      </div>
      <div class="flex justify-between font-semibold">
        <span class="text-slate-700">Saldo pendiente</span>
        <span [class]="sc.saldo > 0 ? 'text-rojo-brillante' : 'text-emerald-600'">
          {{ sc.saldo | currency:'MXN':'symbol-narrow':'1.0-0' }}
        </span>
      </div>
      }
    </div>
  </div>
  }

</div>
```

**Note:** The template references `statusClass()` and `statusLabel()` — add these two computed signals to the TS:

```typescript
private static readonly STATUS: Record<string, { label: string; cls: string }> = {
  borrador:  { label: 'Borrador',  cls: 'bg-slate-100 text-slate-600' },
  enviada:   { label: 'Enviada',   cls: 'bg-blue-100 text-blue-700' },
  aprobada:  { label: 'Aprobada',  cls: 'bg-emerald-100 text-emerald-700' },
  rechazada: { label: 'Rechazada', cls: 'bg-red-100 text-red-700' },
  vencida:   { label: 'Vencida',   cls: 'bg-amber-100 text-amber-700' },
};

readonly statusLabel = computed(() =>
  QuoteDetailComponent.STATUS[this.quote().estado]?.label ?? this.quote().estado
);
readonly statusClass = computed(() =>
  QuoteDetailComponent.STATUS[this.quote().estado]?.cls ?? 'bg-slate-100 text-slate-600'
);
```

Add these to the class body in `quote-detail.ts` (before `itemGroups`).

- [ ] **Step 3: Verify build**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | grep -E '(ERROR|✘|Output location)'
```

Expected: `Output location: .../dist/hula-hoop` — zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/shared/components/quote-detail/
git commit -m "feat(quote-detail): add shared QuoteDetailComponent with category grouping"
```

---

## Task 2: Wizard — Step 5 uses component + free lines in Step 4

**Files:**
- Modify: `src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.ts`
- Modify: `src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.html`

**Interfaces:**
- Consumes from Task 1: `QuoteDetailComponent` selector `app-quote-detail`, `input<Quote>()`
- The wizard's `summaryQuote` computed (or equivalent Step 5 data) is passed as `[quote]`

**READ BOTH FILES FULLY before making any changes.** The wizard is complex — understand the full structure first.

- [ ] **Step 1: Add `freeLines` signal and methods to `admin-quote-wizard.ts`**

Find where the other step-4 signals are declared (around `readonly extras`, `readonly extraQty`, etc.) and add after them:

```typescript
// ── Step 4 — Líneas personalizadas ───────────────────────────
readonly freeLines = signal<{ descripcion: string; cantidad: number; precio_unitario: number }[]>([]);

readonly freeLinesTotal = computed(() =>
  this.freeLines().reduce((s, l) => s + Math.round(l.cantidad * l.precio_unitario * 100), 0)
);
```

- [ ] **Step 2: Update `totalCents` computed to include `freeLinesTotal`**

Find the computed signal that sums all costs (it sums `subtotalCents`, `extrasTotalCents`, `decorationUpgradeCents`, etc.). Add `+ this.freeLinesTotal()` to it.

Example — the exact computed name may differ, find it by searching for `subtotalCents`:
```typescript
readonly totalCents = computed(() =>
  this.packageCents() +
  this.extrasTotalCents() +
  this.decorationUpgradeCents() +
  this.freeLinesTotal() +        // ← ADD THIS
  this.activityTotalCents()
);
```

- [ ] **Step 3: Add free-line management methods**

Add these three methods to the wizard class (near the Step 4 methods):

```typescript
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
```

- [ ] **Step 4: Update `buildQuoteItems()` to include free lines**

Find `buildQuoteItems()` (around line 496). At the end, before the `return items;`:

```typescript
// Free/custom lines
for (const line of this.freeLines()) {
  if (line.descripcion.trim()) {
    items.push({
      descripcion:    line.descripcion.trim(),
      cantidad:       line.cantidad,
      precio_unitario: line.precio_unitario,
    });
  }
}
```

- [ ] **Step 5: Update `populateFromQuote()` to recover free lines**

`populateFromQuote()` iterates `quote.items` and matches each item to known wizard controls (package, snack, decoration, activity, glam, extras). Any item that doesn't match anything is currently ignored — these are the free lines to recover.

Find the end of the `for (const item of quote.items)` loop (around line 329). After the loop but before `this.selectedCategory.set(...)`, add collection of unmatched items:

```typescript
// Collect unmatched items as free lines
const KNOWN_PREFIXES = [
  'Merienda:', 'Upgrade de Decoración:', 'Actividad Premium:',
  'Actividad Incluida:', 'Área Glam Girls',
];
const matched = new Set<string>([
  ...(pkg ? [pkg.name] : []),
  ...[...extQty.keys()].flatMap(id => {
    const e = this.extras().find(x => x.id === id);
    if (!e) return [];
    const vid = extVar.get(id);
    const vname = vid ? e.variants?.find(v => v.id === vid)?.name : undefined;
    return vname ? [`${e.name} (${vname})`, `${e.name} (${vname}) (cobro en local)`]
                 : [e.name, `${e.name} (cobro en local)`];
  }),
]);

const recovered = quote.items
  .filter(item => {
    const d = item.descripcion;
    if (KNOWN_PREFIXES.some(p => d.startsWith(p))) return false;
    if (d.startsWith('Área Glam Girls')) return false;
    return !matched.has(d);
  })
  .map(item => ({
    descripcion:    item.descripcion,
    cantidad:       item.cantidad,
    precio_unitario: item.precio_unitario,
  }));

this.freeLines.set(recovered);
```

Also reset `freeLines` at the beginning of `populateFromQuote()`:
```typescript
this.freeLines.set([]);
```

- [ ] **Step 6: Add `QuoteDetailComponent` to wizard imports**

In `admin-quote-wizard.ts`:

```typescript
import { QuoteDetailComponent } from '../../../../shared/components/quote-detail/quote-detail';
```

Add `QuoteDetailComponent` to the `@Component` `imports` array.

- [ ] **Step 7: Build a `summaryQuote` computed for Step 5**

The wizard needs to pass a `Quote`-shaped object to `<app-quote-detail>`. Find the existing `summaryItems()` computed and the current Step 5 summary logic. Add this computed:

```typescript
readonly summaryQuote = computed((): Quote => {
  const client = this.selectedClient();
  const slot   = this.selectedSlot();
  const date   = this.selectedDate();
  const items  = this.summaryItems().map((item, i) => ({
    id:              `preview-${i}`,
    quote_id:        'preview',
    descripcion:     item.label,
    cantidad:        item.qty,
    precio_unitario: item.unitPrice,
    subtotal:        item.qty * item.unitPrice,
  }));
  return {
    id:             'preview',
    venue_id:       '',
    folio:          this.editingQuote()?.folio ?? 'Nueva cotización',
    public_token:   '',
    client_id:      client?.id ?? null,
    fecha:          new Date().toISOString().split('T')[0],
    fecha_evento:   date ? date.toISOString().split('T')[0] : null,
    hora_inicio:    slot?.start_time ?? null,
    hora_fin:       slot?.end_time ?? null,
    guest_count:    this.guestCount(),
    estado:         this.editingQuote()?.estado ?? 'borrador',
    subtotal:       this.subtotalCents() / 100,
    descuento:      this.discount(),
    total:          this.totalCents() / 100,
    deposit_amount: this.depositAmount() > 0 ? this.depositAmount() / 100 : null,
    time_slot_id:   null,
    mp_preference_id: null,
    snack_option_id: null,
    package_id:     null,
    notas:          this.notes() || null,
    created_at:     '',
    client:         client ? { nombre: client.nombre, email: client.email ?? null, telefono: client.telefono ?? null } : undefined,
    items,
  };
});
```

**Note:** Check the exact field names of `summaryItems()` entries in the existing code — they may use `label`, `qty`, `unitPrice` or different names. Adjust the mapping accordingly. Also verify the correct names for `depositAmount()`, `subtotalCents()`, `totalCents()`, `discount()`, `notes()` by searching the wizard TS file.

- [ ] **Step 8: Replace Step 5 HTML with component**

In `admin-quote-wizard.html`, find the `@case (5)` block (or the `@if (currentStep() === 5)` block). Replace its interior content (the summary cards/tables that show the quote preview) with:

```html
<app-quote-detail [quote]="summaryQuote()" />
```

Keep the step navigation buttons (Anterior / Guardar cotización) — only replace the content cards.

- [ ] **Step 9: Add free lines section to Step 4 HTML**

In `admin-quote-wizard.html`, find the Step 4 block. At the END of the extras/category section, before the closing of the step container, add:

```html
<!-- Líneas personalizadas -->
<div class="mt-6 border-t border-slate-100 pt-5">
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-sm font-semibold text-slate-700">Líneas personalizadas</h3>
    <button type="button" (click)="addFreeLine()"
      class="flex items-center gap-1.5 text-xs font-semibold text-rojo-brillante hover:text-rojo-brillante/80 transition-colors">
      <i class="pi pi-plus-circle text-xs" aria-hidden="true"></i>
      Agregar línea
    </button>
  </div>
  @for (line of freeLines(); track $index; let i = $index) {
  <div class="flex gap-2 items-center mb-2">
    <input
      type="text"
      [value]="line.descripcion"
      (input)="updateFreeLine(i, 'descripcion', $any($event.target).value)"
      placeholder="Descripción del concepto"
      class="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rojo-brillante/30" />
    <input
      type="number"
      [value]="line.cantidad"
      (input)="updateFreeLine(i, 'cantidad', $any($event.target).value)"
      min="1"
      class="w-16 rounded-lg border border-slate-200 px-2 py-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-rojo-brillante/30"
      aria-label="Cantidad" />
    <div class="relative">
      <span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" aria-hidden="true">$</span>
      <input
        type="number"
        [value]="line.precio_unitario"
        (input)="updateFreeLine(i, 'precio_unitario', $any($event.target).value)"
        min="0"
        step="0.01"
        class="w-28 rounded-lg border border-slate-200 pl-6 pr-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rojo-brillante/30"
        aria-label="Precio unitario" />
    </div>
    <button type="button" (click)="removeFreeLine(i)"
      class="w-7 h-7 shrink-0 rounded-full bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-600 flex items-center justify-center text-base transition-colors"
      aria-label="Eliminar línea">
      ×
    </button>
  </div>
  }
  @if (freeLines().length === 0) {
  <p class="text-xs text-slate-400 italic">Sin líneas personalizadas. Usa "Agregar línea" para conceptos fuera del catálogo.</p>
  }
</div>
```

- [ ] **Step 10: Verify build**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | grep -E '(ERROR|✘|Output location)'
```

Expected: zero errors.

- [ ] **Step 11: Commit**

```bash
git add src/app/features/admin/pages/admin-quote-wizard/
git commit -m "feat(wizard): use QuoteDetailComponent in Step 5 and add free line items to Step 4"
```

---

## Task 3: Event detail — Cotización tab embeds `QuoteDetailComponent`

**Files:**
- Modify: `src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts`
- Modify: `src/app/features/admin/pages/admin-event-detail/admin-event-detail.html`

**Interfaces:**
- Consumes from Task 1: `QuoteDetailComponent` with `[quote]="quote()!"` and `[contract]="contract()!"`
- The existing `quote()` signal (`signal<Quote | null>`) and `contract()` signal (`signal<Contract | null>`) are already present — do NOT change them

**Critical:** The amendment section in the HTML (badge, "Modificar Cotización" button, inline editor) must remain **completely unchanged**. Only the view cards above it get replaced.

- [ ] **Step 1: Add import to `admin-event-detail.ts`**

Read the file first. Add import:
```typescript
import { QuoteDetailComponent } from '../../../../shared/components/quote-detail/quote-detail';
```

Add `QuoteDetailComponent` to the `@Component` `imports` array.

- [ ] **Step 2: Replace the view cards in `admin-event-detail.html`**

Read the file. The "Cotización" tab content starts at `@if (activeTab() === 'cotizacion')` (around line 930).

The `@else` branch (when `quote()` exists) starts after `} @else {` (around line 944) with:
```html
@let q = quote()!;
<div class="space-y-5">
  <!-- Quote header -->
  ...
  <!-- Quote items -->
  ...
  <!-- Quote totals -->
  ...
  <!-- Notas -->
  ...
</div>
```

Replace ONLY the `@let q = quote()!;` and the `<div class="space-y-5">` with all its view card children — everything up to (but NOT including) the amendment badge `@if (amendment() && ...)` — with:

```html
<app-quote-detail
  [quote]="quote()!"
  [contract]="contract()!"
/>
```

**Do NOT touch:**
- The `@if (!quote())` empty state block
- The amendment badge `@if (amendment() && amendment()!.status === 'pending_approval')`
- The "Modificar Cotización" button
- The `@if (amendmentEditing())` inline editor block
- Anything in `admin-event-detail.ts`

- [ ] **Step 3: Verify build**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | grep -E '(ERROR|✘|Output location)'
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts \
        src/app/features/admin/pages/admin-event-detail/admin-event-detail.html
git commit -m "feat(event-detail): embed QuoteDetailComponent in Cotización tab"
```

---

## Task 4: `admin-quotes` — row click navigates to wizard

**Files:**
- Modify: `src/app/features/admin/pages/admin-quotes/admin-quotes.html`

**Interfaces:**
- Consumes: `openEdit(quote: Quote)` — already exists in `admin-quotes.ts`, navigates to `/admin/cotizaciones/:id/editar`
- No TS changes needed — `openEdit` is already defined

**Note:** `openEdit(quote)` is already defined in `admin-quotes.ts` and navigates to `/admin/cotizaciones/:quote.id/editar`. The wizard loads the quote on init and jumps to Step 5 (summary). No new method needed.

- [ ] **Step 1: Make the `<tr>` row clickable**

Read `admin-quotes.html`. Find the `<tr>` element for each quote row (around line 75):

```html
<tr class="hover:bg-slate-50/60 transition-colors">
```

Replace with:

```html
<tr
  class="hover:bg-slate-50/60 transition-colors cursor-pointer"
  (click)="openEdit(quote)"
  role="button"
  [attr.aria-label]="'Ver cotización ' + quote.folio">
```

- [ ] **Step 2: Add `$event.stopPropagation()` to all action buttons in the row**

Still in `admin-quotes.html`, find every `<button>` element inside the `@for (quote of filteredQuotes()` loop. Each button that already has a `(click)` handler needs `$event.stopPropagation()` added:

The buttons to update (lines ~111–168):
- Reschedule button: `(click)="openRescheduleDialog(quote); $event.stopPropagation()"`
- Anticipo button: `(click)="openAnticoDialog(quote); $event.stopPropagation()"`
- Go to event button: `(click)="goToEvent(contractId); $event.stopPropagation()"`
- Download PDF button: `(click)="downloadPdf(quote); $event.stopPropagation()"`
- Copy link button: `(click)="copyPublicLink(quote); $event.stopPropagation()"`
- Send panel button: `(click)="openSendPanel(quote); $event.stopPropagation()"`
- Edit button: `(click)="openEdit(quote); $event.stopPropagation()"`
- Delete button: `(click)="confirmDelete(quote); $event.stopPropagation()"`

**Pattern to follow:** add `; $event.stopPropagation()` after the existing method call in each `(click)` binding. Do NOT change any other attributes or classes.

- [ ] **Step 3: Verify build**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | grep -E '(ERROR|✘|Output location)'
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/admin/pages/admin-quotes/admin-quotes.html
git commit -m "feat(admin-quotes): click quote row navigates to detail/edit view"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `QuoteDetailComponent` with 6 sections: header, client+event, items by category, totals, notes, contract status (Task 1)
- ✅ Items grouped by category with cleaned descriptions (Task 1)
- ✅ `precio_unitario === 0` shows "Incluido" badge (Task 1)
- ✅ Contract status section only when `contract` input is provided (Task 1)
- ✅ Wizard Step 5 uses the component (Task 2)
- ✅ Free lines in Step 4: add/remove/update, included in `buildQuoteItems()` (Task 2)
- ✅ `populateFromQuote()` recovers free lines on edit (Task 2)
- ✅ Event detail tab embeds the component — amendment section untouched (Task 3)
- ✅ Quote row click navigates to wizard (Task 4)
- ✅ All action buttons have `stopPropagation` (Task 4)

**Type consistency:**
- `QuoteDetailComponent` takes `input.required<Quote>()` — all callers pass a `Quote` object
- `summaryQuote` in wizard produces `Quote` type — verify all required fields are populated
- `freeLines` items have `{ descripcion, cantidad, precio_unitario }` matching `buildQuoteItems()` item shape

**Potential pitfall — `summaryItems()` field names:**
The wizard's `summaryItems()` computed may use different field names than `label`/`qty`/`unitPrice`. The implementer **must read the wizard TS file** to find the exact field names of each summary item before writing `summaryQuote`. This is the most likely source of a TypeScript error in Task 2, Step 7.
