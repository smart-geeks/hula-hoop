# Mixed Payment Methods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a single payment to be split across multiple methods (e.g. $1,200 cash + $3,800 card) in all three payment contexts — quote anticipo dialog, event payment dialog, and POS checkout — with a unified receipt showing all methods.

**Architecture:** A JSONB `payment_splits` column is added to `contract_payments` and `pos_sales` (backfilling all existing rows). A shared `PaymentSplitsInputComponent` replaces the current single-method selects in all three UIs. The `PosTicketPrintService` iterates splits to render one line per method on both ESC/POS and HTML receipts.

**Tech Stack:** Angular 20 zoneless, TypeScript strict, Tailwind CSS, Supabase PostgreSQL, ESC/POS thermal printing.

## Global Constraints

- Angular 20 zoneless — NO `NgZone`, NO `ChangeDetectorRef.detectChanges()`
- NO `standalone: true` in any `@Component` decorator (default in Angular v20+)
- NO `async ngOnInit()` — constructor + `private async loadXxx()` pattern only
- `ChangeDetectionStrategy.OnPush` on every component
- External template files only (`.html`) — NEVER inline templates
- `inject()` for all dependency injection — no constructor injection
- Native control flow: `@if`, `@for`, `@switch` — never `*ngIf`, `*ngFor`
- NO `ngClass`, NO `ngStyle` — only `[class.foo]`, `[class]`, `[style.prop]`
- `| currencyMxn` ONLY for money display — the pipe expects **cents** (int), divides by 100 internally. Payment amounts in the dialogs are in **pesos** → multiply by 100 before piping: `monto * 100 | currencyMxn`
- Signal mutations via `.set()` or `.update()` — never `.mutate()`
- No arrow functions in templates
- No `new Date()` or `Math.*` in templates — use `computed()` signals
- Build command: `npm run build` in `/home/eduardo/Proyectos/hula-hoop` — must produce zero NG/TS errors

---

## File Map

| Action | Path |
|---|---|
| CREATE | `supabase/migrations/20260628000003_add_payment_splits.sql` |
| CREATE | `src/app/shared/components/payment-splits-input/payment-splits-input.ts` |
| CREATE | `src/app/shared/components/payment-splits-input/payment-splits-input.html` |
| MODIFY | `src/app/core/interfaces/contract.ts` |
| MODIFY | `src/app/core/interfaces/pos.ts` |
| MODIFY | `src/app/core/services/pos-ticket-print.service.ts` |
| MODIFY | `src/app/features/admin/pages/admin-quotes/admin-quotes.ts` |
| MODIFY | `src/app/features/admin/pages/admin-quotes/admin-quotes.html` |
| MODIFY | `src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts` |
| MODIFY | `src/app/features/admin/pages/admin-event-detail/admin-event-detail.html` |
| MODIFY | `src/app/features/admin/pages/admin-pos/admin-pos.ts` |
| MODIFY | `src/app/features/admin/pages/admin-pos/admin-pos.html` |

---

## Task 1: DB migration + TypeScript interfaces

**Files:**
- Create: `supabase/migrations/20260628000003_add_payment_splits.sql`
- Modify: `src/app/core/interfaces/contract.ts`
- Modify: `src/app/core/interfaces/pos.ts`

**Interfaces produced (consumed by all later tasks):**
```typescript
// contract.ts
export interface PaymentSplit {
  metodo: 'efectivo' | 'tarjeta' | 'transferencia';
  monto: number; // in pesos
}
// ContractPayment gains: payment_splits?: PaymentSplit[]
// ContractPayment.metodo union gains: | 'combinado'

// pos.ts
// PaymentMethod gains: | 'combinado'
// PosSale gains: payment_splits?: PaymentSplit[]
// CreateSaleData gains: payment_splits?: PaymentSplit[]
```

- [ ] **Step 1: Create the DB migration**

Create `supabase/migrations/20260628000003_add_payment_splits.sql`:

```sql
-- Add payment_splits JSONB to contract_payments and backfill
ALTER TABLE contract_payments
  ADD COLUMN IF NOT EXISTS payment_splits JSONB;

UPDATE contract_payments
SET payment_splits = jsonb_build_array(
  jsonb_build_object('metodo', metodo, 'monto', monto)
)
WHERE payment_splits IS NULL;

-- Add payment_splits JSONB to pos_sales and backfill
ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS payment_splits JSONB;

UPDATE pos_sales
SET payment_splits = jsonb_build_array(
  jsonb_build_object('metodo', pagado_con, 'monto', total)
)
WHERE payment_splits IS NULL;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Run in the project's Supabase instance (project_id: `jzdfxbbnhkzdetrpmqdx`):

```sql
ALTER TABLE contract_payments
  ADD COLUMN IF NOT EXISTS payment_splits JSONB;

UPDATE contract_payments
SET payment_splits = jsonb_build_array(
  jsonb_build_object('metodo', metodo, 'monto', monto)
)
WHERE payment_splits IS NULL;

ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS payment_splits JSONB;

UPDATE pos_sales
SET payment_splits = jsonb_build_array(
  jsonb_build_object('metodo', pagado_con, 'monto', total)
)
WHERE payment_splits IS NULL;
```

Verify: `SELECT id, metodo, monto, payment_splits FROM contract_payments LIMIT 3;`
Expected: `payment_splits` column contains `[{"metodo":"efectivo","monto":1234}]` for each row.

- [ ] **Step 3: Update `src/app/core/interfaces/contract.ts`**

Replace the file entirely with:

```typescript
export type ContractStatus = 'borrador' | 'firmado' | 'liquidado' | 'cancelado' | 'concluido';

export interface PaymentSplit {
  metodo: 'efectivo' | 'tarjeta' | 'transferencia';
  monto: number; // in pesos
}

export interface ContractPayment {
  id: string;
  contract_id: string;
  monto: number;
  fecha: string;
  metodo: 'efectivo' | 'tarjeta' | 'transferencia' | 'combinado';
  tipo: 'anticipo' | 'abono' | 'liquidacion' | 'extra' | 'modificacion';
  notas: string | null;
  created_at: string;
  payment_splits?: PaymentSplit[];
}

export interface Contract {
  id: string;
  venue_id: string;
  folio: string;
  quote_id: string | null;
  client_id: string | null;
  fecha_firma: string | null;
  fecha_evento: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  salon_renta: number;
  total_contrato: number;
  deposito_pagado: number;
  saldo_pendiente: number;
  estado: ContractStatus;
  pdf_url: string | null;
  ine_url?: string | null;
  comprobante_url?: string | null;
  firma_url?: string | null;
  firma_representante_url?: string | null;
  doc_metadata?: Record<string, { replaced_by: string; replaced_at: string } | null> | null;
  notas: string | null;
  created_at: string;
  // Relations
  client?: { nombre: string; email: string | null; telefono: string | null };
  payments?: ContractPayment[];
}

export interface CreateContractData {
  venue_id?: string;
  quote_id?: string;
  client_id?: string;
  fecha_evento: string;
  hora_inicio?: string;
  hora_fin?: string;
  salon_renta: number;
  total_contrato: number;
  deposito_pagado?: number;
  estado?: ContractStatus;
  pdf_url?: string | null;
  ine_url?: string | null;
  comprobante_url?: string | null;
  firma_url?: string | null;
  fecha_firma?: string | null;
  notas?: string;
}

export type UpdateContractData = Partial<CreateContractData>;
```

- [ ] **Step 4: Update `src/app/core/interfaces/pos.ts`**

Read the file first. Then add `| 'combinado'` to `PaymentMethod` and `payment_splits?: PaymentSplit[]` to `PosSale` and `CreateSaleData`.

Import `PaymentSplit` from contract:
```typescript
import type { PaymentSplit } from './contract';
```

Change:
```typescript
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia';
```
To:
```typescript
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'combinado';
```

In `PosSale` interface add:
```typescript
payment_splits?: PaymentSplit[];
```

In `CreateSaleData` interface add:
```typescript
payment_splits?: PaymentSplit[];
```

- [ ] **Step 5: Verify build**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | grep -E '(ERROR|✘|Output location)'
```

Expected: `Output location: .../dist/hula-hoop` — zero errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260628000003_add_payment_splits.sql \
        src/app/core/interfaces/contract.ts \
        src/app/core/interfaces/pos.ts
git commit -m "feat(payments): add payment_splits JSONB column and update TypeScript interfaces"
```

---

## Task 2: `PaymentSplitsInputComponent`

**Files:**
- Create: `src/app/shared/components/payment-splits-input/payment-splits-input.ts`
- Create: `src/app/shared/components/payment-splits-input/payment-splits-input.html`

**Interfaces:**
- Consumes: `PaymentSplit` from `../../../../core/interfaces/contract`
- Produces:
  - Selector: `app-payment-splits-input`
  - `total = input.required<number>()` — total amount in pesos
  - `splits = model<PaymentSplit[]>([])` — two-way binding array
  - `isValid = computed<boolean>()` — true when splits sum === total

- [ ] **Step 1: Create the TypeScript component**

Create `src/app/shared/components/payment-splits-input/payment-splits-input.ts`:

```typescript
import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { CurrencyMxnPipe } from '../../../core/pipes/currency-mxn.pipe';
import type { PaymentSplit } from '../../../core/interfaces/contract';

@Component({
  selector: 'app-payment-splits-input',
  templateUrl: './payment-splits-input.html',
  imports: [CurrencyMxnPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentSplitsInputComponent {
  readonly total  = input.required<number>();
  readonly splits = model<PaymentSplit[]>([]);

  readonly methodOptions: { value: PaymentSplit['metodo']; label: string; icon: string }[] = [
    { value: 'efectivo',      label: 'Efectivo',      icon: 'pi-money-bill'  },
    { value: 'tarjeta',       label: 'Tarjeta',       icon: 'pi-credit-card' },
    { value: 'transferencia', label: 'Transferencia', icon: 'pi-send'        },
  ];

  readonly remaining = computed(() => {
    const sum = this.splits().reduce((s, sp) => s + (sp.monto || 0), 0);
    return Math.round((this.total() - sum) * 100) / 100;
  });

  readonly remainingCents = computed(() => Math.round(this.remaining() * 100));

  readonly remainingIsPositive = computed(() => this.remaining() > 0.01);

  readonly remainingIsNegative = computed(() => this.remaining() < -0.01);

  readonly hasRemainder = computed(
    () => this.remainingIsPositive() || this.remainingIsNegative(),
  );

  readonly isValid = computed(
    () =>
      this.splits().length > 0 &&
      this.splits().every((sp) => sp.monto > 0) &&
      !this.hasRemainder(),
  );

  readonly canAddSplit = computed(() => this.splits().length < 3);

  isMethodUsedElsewhere(rowIndex: number, method: PaymentSplit['metodo']): boolean {
    return this.splits().some((s, i) => i !== rowIndex && s.metodo === method);
  }

  addSplit(): void {
    const current  = this.splits();
    if (current.length >= 3) return;
    const used     = current.map((s) => s.metodo);
    const next     = (this.methodOptions.find((m) => !used.includes(m.value))?.value) ?? 'tarjeta';
    const rem      = Math.max(0, this.remaining());
    this.splits.update((list) => [...list, { metodo: next, monto: rem }]);
  }

  removeSplit(index: number): void {
    if (this.splits().length <= 1) return;
    this.splits.update((list) => list.filter((_, i) => i !== index));
  }

  updateMonto(index: number, raw: string): void {
    const val  = parseFloat(raw);
    const monto = isNaN(val) ? 0 : Math.max(0, val);
    const list  = this.splits().map((s, i) => (i === index ? { ...s, monto } : s));
    // Auto-fill second row remainder when exactly 2 splits
    if (list.length === 2 && index === 0) {
      const rem = Math.max(0, Math.round((this.total() - monto) * 100) / 100);
      list[1] = { ...list[1], monto: rem };
    }
    this.splits.set(list);
  }

  updateMetodo(index: number, metodo: string): void {
    const method = metodo as PaymentSplit['metodo'];
    this.splits.update((list) =>
      list.map((s, i) => (i === index ? { ...s, metodo: method } : s)),
    );
  }
}
```

- [ ] **Step 2: Create the HTML template**

Create `src/app/shared/components/payment-splits-input/payment-splits-input.html`:

```html
<div class="space-y-2">

  @for (split of splits(); track $index; let i = $index) {
    <div class="flex gap-2 items-center">

      <!-- Method selector -->
      <select
        [value]="split.metodo"
        (change)="updateMetodo(i, $any($event.target).value)"
        class="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rojo-brillante/30">
        @for (m of methodOptions; track m.value) {
          <option
            [value]="m.value"
            [disabled]="isMethodUsedElsewhere(i, m.value)"
            [selected]="split.metodo === m.value">
            {{ m.label }}
          </option>
        }
      </select>

      <!-- Amount input -->
      <div class="relative">
        <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" aria-hidden="true">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          [value]="split.monto"
          (input)="updateMonto(i, $any($event.target).value)"
          class="w-32 rounded-lg border border-slate-200 bg-white pl-6 pr-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rojo-brillante/30"
          [attr.aria-label]="'Monto ' + split.metodo" />
      </div>

      <!-- Remove button (hidden when only 1 row) -->
      @if (splits().length > 1) {
        <button
          type="button"
          (click)="removeSplit(i)"
          class="w-7 h-7 shrink-0 rounded-full bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 flex items-center justify-center text-base leading-none transition-colors"
          aria-label="Eliminar método de pago">
          ×
        </button>
      }

    </div>
  }

  <!-- Remainder indicator -->
  @if (hasRemainder()) {
    <p
      [class]="'text-xs font-medium px-1 ' + (remainingIsPositive() ? 'text-amber-600' : 'text-red-600')"
      role="alert">
      @if (remainingIsPositive()) {
        Restante por asignar: {{ remainingCents() | currencyMxn }}
      } @else {
        Excede el total por: {{ (remainingCents() * -1) | currencyMxn }}
      }
    </p>
  }

  <!-- Add split button -->
  @if (canAddSplit()) {
    <button
      type="button"
      (click)="addSplit()"
      class="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-rojo-brillante transition-colors mt-1">
      <i class="pi pi-plus-circle text-xs" aria-hidden="true"></i>
      Dividir pago
    </button>
  }

</div>
```

- [ ] **Step 3: Verify build**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | grep -E '(ERROR|✘|Output location)'
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/shared/components/payment-splits-input/
git commit -m "feat(payments): add PaymentSplitsInputComponent with auto-fill remainder"
```

---

## Task 3: Update `PosTicketPrintService` print methods

**Files:**
- Modify: `src/app/core/services/pos-ticket-print.service.ts`

**Context:** There are 4 render paths to update — 2 for POS sales (`buildSaleEscPos` and `buildSaleHtml`) and 2 for contract payments (`buildPaymentEscPos` and `buildPaymentHtml`). In each case: replace the single "Forma de pago" line with a loop over `payment_splits`. Drawer kick should fire when any split is `efectivo`.

**Consumes from Task 1:** `PaymentSplit` type (already on `ContractPayment.payment_splits` and `PosSale.payment_splits`).

- [ ] **Step 1: Update `buildSaleEscPos` — payment section**

Read the file. Find `buildSaleEscPos` (around line 259). Locate the payment section at approximately line 341-359:

```typescript
// BEFORE (lines ~341-360)
builder.dashedLine();
const label = PAYMENT_LABELS[sale.pagado_con] ?? sale.pagado_con.toUpperCase();
builder.row('Forma de pago:', label);
builder.solidLine();
// ...
if (sale.pagado_con === 'efectivo') {
  builder.kickDrawer();
}
```

Replace with:

```typescript
builder.dashedLine();
const saleSplits = sale.payment_splits?.length
  ? sale.payment_splits
  : [{ metodo: sale.pagado_con as string, monto: sale.total }];

if (saleSplits.length === 1) {
  const label = PAYMENT_LABELS[saleSplits[0].metodo] ?? saleSplits[0].metodo.toUpperCase();
  builder.row('Forma de pago:', label);
} else {
  builder.textLine('Forma de pago:');
  for (const sp of saleSplits) {
    const lbl = PAYMENT_LABELS[sp.metodo] ?? sp.metodo.toUpperCase();
    builder.row(`  ${lbl}`, this.fmt(sp.monto));
  }
}
builder.solidLine();
// ...
const hasEfectivo = saleSplits.some((sp) => sp.metodo === 'efectivo');
if (hasEfectivo) {
  builder.kickDrawer();
}
```

- [ ] **Step 2: Update `buildSaleHtml` — payment table**

Find `buildSaleHtml` (around line 732). Locate the payment table at approximately line 814-818:

```typescript
// BEFORE
<table>
  <tr>
    <td class="xs">Forma de pago</td>
    <td class="r bold">${PAYMENT_LABELS[sale.pagado_con] ?? sale.pagado_con.toUpperCase()}</td>
  </tr>
</table>
```

Replace with:

```typescript
const saleSplitsHtml = sale.payment_splits?.length
  ? sale.payment_splits
  : [{ metodo: sale.pagado_con as string, monto: sale.total }];

const salePaymentRows = saleSplitsHtml.length === 1
  ? `<tr>
      <td class="xs">Forma de pago</td>
      <td class="r bold">${PAYMENT_LABELS[saleSplitsHtml[0].metodo] ?? saleSplitsHtml[0].metodo.toUpperCase()}</td>
    </tr>`
  : saleSplitsHtml.map((sp) =>
      `<tr>
        <td class="xs">${PAYMENT_LABELS[sp.metodo] ?? sp.metodo.toUpperCase()}</td>
        <td class="r bold">${this.fmt(sp.monto)}</td>
      </tr>`
    ).join('');
```

Then in the template string replace the table with:

```typescript
<table>
  ${salePaymentRows}
</table>
```

- [ ] **Step 3: Update `buildPaymentEscPos` — payment section**

Find `buildPaymentEscPos` (around line 369). Locate the payment section at approximately lines 474-518:

```typescript
// BEFORE (lines ~474-518)
const label = PAYMENT_LABELS[payment.metodo] ?? payment.metodo.toUpperCase();
builder.row('Forma de pago:', label);
// ...
if (payment.metodo === 'efectivo') {
  builder.kickDrawer();
}
```

Replace the two chunks with:

```typescript
const paymentSplits = payment.payment_splits?.length
  ? payment.payment_splits
  : [{ metodo: payment.metodo as string, monto: payment.monto }];

if (paymentSplits.length === 1) {
  const label = PAYMENT_LABELS[paymentSplits[0].metodo] ?? paymentSplits[0].metodo.toUpperCase();
  builder.row('Forma de pago:', label);
} else {
  builder.textLine('Forma de pago:');
  for (const sp of paymentSplits) {
    const lbl = PAYMENT_LABELS[sp.metodo] ?? sp.metodo.toUpperCase();
    builder.row(`  ${lbl}`, this.fmt(sp.monto));
  }
}
```

And for the drawer kick:

```typescript
const payHasEfectivo = paymentSplits.some((sp) => sp.metodo === 'efectivo');
if (payHasEfectivo) {
  builder.kickDrawer();
}
```

- [ ] **Step 4: Update `buildPaymentHtml` — payment table**

Find `buildPaymentHtml` (around line 833). Locate the payment table at approximately line 973-977:

```typescript
// BEFORE
<table style="margin-top:1mm; width:100%">
  <tr>
    <td class="xs" style="text-align:left">Forma de pago</td>
    <td class="r bold" style="text-align:right">${PAYMENT_LABELS[payment.metodo] ?? payment.metodo.toUpperCase()}</td>
  </tr>
</table>
```

Replace with:

```typescript
const paymentSplitsHtml = payment.payment_splits?.length
  ? payment.payment_splits
  : [{ metodo: payment.metodo as string, monto: payment.monto }];

const paymentRows = paymentSplitsHtml.length === 1
  ? `<tr>
      <td class="xs" style="text-align:left">Forma de pago</td>
      <td class="r bold" style="text-align:right">${PAYMENT_LABELS[paymentSplitsHtml[0].metodo] ?? paymentSplitsHtml[0].metodo.toUpperCase()}</td>
    </tr>`
  : paymentSplitsHtml.map((sp) =>
      `<tr>
        <td class="xs" style="text-align:left">${PAYMENT_LABELS[sp.metodo] ?? sp.metodo.toUpperCase()}</td>
        <td class="r bold" style="text-align:right">${this.fmt(sp.monto)}</td>
      </tr>`
    ).join('');
```

Then in the template string:

```typescript
<table style="margin-top:1mm; width:100%">
  ${paymentRows}
</table>
```

- [ ] **Step 5: Verify build**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | grep -E '(ERROR|✘|Output location)'
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/services/pos-ticket-print.service.ts
git commit -m "feat(payments): update ticket print service to render all payment splits on receipt"
```

---

## Task 4: Integrate into `admin-quotes` anticipo dialog

**Files:**
- Modify: `src/app/features/admin/pages/admin-quotes/admin-quotes.ts`
- Modify: `src/app/features/admin/pages/admin-quotes/admin-quotes.html`

**Context:** `admin-quotes.ts` has signals `anticoMetodo = signal<PayMethod>('efectivo')` (line 74) and `anticoMonto` (line 72). `submitAnticipo()` (line 281) passes `metodo: this.anticoMetodo()` to `addPayment` (line 333). The HTML has a `<select>` at lines 318-321 for method selection. `submitAnticipo` also calls `ticketPrint.printPayment(fullContract, lastPayment, quote)` — `lastPayment` is read back from DB so it will have `payment_splits` automatically after the migration.

**Consumes from Task 1:** `PaymentSplit` from `contract.ts`
**Consumes from Task 2:** `PaymentSplitsInputComponent` selector `app-payment-splits-input`

- [ ] **Step 1: Update `admin-quotes.ts`**

Read the full file first. Then:

**a) Add import:**
```typescript
import type { PaymentSplit } from '../../../../core/interfaces/contract';
import { PaymentSplitsInputComponent } from '../../../../shared/components/payment-splits-input/payment-splits-input';
```

**b) Remove signal:**
```typescript
// DELETE this line:
readonly anticoMetodo  = signal<PayMethod>('efectivo');
```

**c) Add replacement signal:**
```typescript
readonly anticoSplits  = signal<PaymentSplit[]>([]);
```

**d) Update `@Component` imports array** — add `PaymentSplitsInputComponent`.

**e) Update `openAnticoDialog()` method** — find where `anticoMetodo.set('efectivo')` is called (around line 162) and replace with:
```typescript
this.anticoSplits.set([{ metodo: 'efectivo', monto: quote.deposit_amount ?? quote.total }]);
```

**f) Update `submitAnticipo()` at the `addPayment` call (around line 330-336):**

Replace:
```typescript
await this.contractService.addPayment(contract.id, {
  monto,
  fecha:  this.anticoFecha(),
  metodo: this.anticoMetodo(),
  tipo:   'anticipo',
  notas:  `Anticipo — cotización ${quote.folio}`,
});
```

With:
```typescript
const splits = this.anticoSplits();
const metodo = splits.length === 1 ? splits[0].metodo : 'combinado';
await this.contractService.addPayment(contract.id, {
  monto,
  fecha:           this.anticoFecha(),
  metodo,
  tipo:            'anticipo',
  notas:           `Anticipo — cotización ${quote.folio}`,
  payment_splits:  splits,
});
```

**g) Add computed for submit disabled state:**
```typescript
readonly anticoSplitsValid = computed(() =>
  this.anticoSplits().length > 0 &&
  this.anticoSplits().every((s) => s.monto > 0) &&
  Math.abs(this.anticoSplits().reduce((acc, s) => acc + s.monto, 0) - this.anticoMonto()) < 0.01
);
```

- [ ] **Step 2: Update `admin-quotes.html`**

Read the file. Find the anticipo dialog section (around lines 318-348).

**Replace the method select block:**

Find:
```html
<label class="block text-sm font-semibold text-slate-700 mb-1.5">Método de pago</label>
<select
  [value]="anticoMetodo()"
  (change)="anticoMetodo.set($any($event.target).value)"
  ...>
  <option value="efectivo">Efectivo</option>
  <option value="tarjeta">Tarjeta</option>
  <option value="transferencia">Transferencia</option>
</select>
```

Replace with:
```html
<label class="block text-sm font-semibold text-slate-700 mb-1.5">Forma de pago</label>
<app-payment-splits-input
  [total]="anticoMonto()"
  [(splits)]="anticoSplits()"
/>
```

**Update the submit button's disabled condition:**

Find:
```html
[disabled]="anticoSaving() || anticoMonto() <= 0"
```

Replace with:
```html
[disabled]="anticoSaving() || anticoMonto() <= 0 || !anticoSplitsValid()"
```

- [ ] **Step 3: Verify build**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | grep -E '(ERROR|✘|Output location)'
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/admin/pages/admin-quotes/admin-quotes.ts \
        src/app/features/admin/pages/admin-quotes/admin-quotes.html
git commit -m "feat(payments): integrate PaymentSplitsInput into anticipo dialog"
```

---

## Task 5: Integrate into `admin-event-detail` payment dialogs

**Files:**
- Modify: `src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts`
- Modify: `src/app/features/admin/pages/admin-event-detail/admin-event-detail.html`

**Context:** There are two payment selects in this component:
1. **Main pay dialog** (line 1385-1391): `payMetodo = signal<PayMethod>('efectivo')` at line 71, used in `submitPayment()` → `registerPayment(monto, fecha, metodo, notas)` → `contractService.addPayment(...)` at line 271.
2. **Amendment pay dialog** (line 1506-1511): `amendPayMetodo = signal<PayMethod>('efectivo')` at line 166 — this is for extra amendment charges. Also needs updating.

**Consumes from Task 1:** `PaymentSplit`
**Consumes from Task 2:** `PaymentSplitsInputComponent`

- [ ] **Step 1: Update `admin-event-detail.ts`**

Read the full file first. Then:

**a) Add imports:**
```typescript
import type { PaymentSplit } from '../../../../core/interfaces/contract';
import { PaymentSplitsInputComponent } from '../../../../shared/components/payment-splits-input/payment-splits-input';
```

**b) Remove signals (lines ~71 and ~166) and add replacements:**

Remove:
```typescript
readonly payMetodo       = signal<PayMethod>('efectivo');
readonly amendPayMetodo  = signal<PayMethod>('efectivo');
```

Add:
```typescript
readonly paySplits      = signal<PaymentSplit[]>([]);
readonly amendPaySplits = signal<PaymentSplit[]>([]);
```

**c) Add computed signals:**
```typescript
readonly paySplitsValid = computed(() =>
  this.paySplits().length > 0 &&
  this.paySplits().every((s) => s.monto > 0) &&
  Math.abs(this.paySplits().reduce((acc, s) => acc + s.monto, 0) - this.payMonto()) < 0.01
);

readonly amendPaySplitsValid = computed(() =>
  this.amendPaySplits().length > 0 &&
  this.amendPaySplits().every((s) => s.monto > 0) &&
  Math.abs(this.amendPaySplits().reduce((acc, s) => acc + s.monto, 0) - this.amendPayMonto()) < 0.01
);
```

**d) Update `@Component` imports array** — add `PaymentSplitsInputComponent`.

**e) Update `openPayDialog()` — find where `payMetodo.set('efectivo')` is called (line ~248) and replace with:**
```typescript
this.paySplits.set([{ metodo: 'efectivo', monto: this.contract()?.saldo_pendiente ?? 0 }]);
```

**f) Update `submitPayment()` (line ~257) — change to pass splits:**

Replace:
```typescript
async submitPayment(): Promise<void> {
  await this.registerPayment(
    this.payMonto(),
    this.payFecha(),
    this.payMetodo(),
    this.payNotas().trim()
  );
}
```

With:
```typescript
async submitPayment(): Promise<void> {
  const splits = this.paySplits();
  const metodo = splits.length === 1 ? splits[0].metodo : 'combinado';
  await this.registerPayment(
    this.payMonto(),
    this.payFecha(),
    metodo,
    this.payNotas().trim(),
    splits,
  );
}
```

**g) Update `registerPayment()` signature (line ~266):**

Replace:
```typescript
async registerPayment(monto: number, fecha: string, metodo: PayMethod, notas: string): Promise<void> {
  const c = this.contract();
  if (!c || monto <= 0 || !fecha) return;

  this.paySaving.set(true);
  const success = await this.contractService.addPayment(c.id, {
    monto, fecha, metodo, tipo: 'abono', notas: notas || 'Pago registrado desde Event Hub',
  });
```

With:
```typescript
async registerPayment(monto: number, fecha: string, metodo: PayMethod | 'combinado', notas: string, splits?: PaymentSplit[]): Promise<void> {
  const c = this.contract();
  if (!c || monto <= 0 || !fecha) return;

  this.paySaving.set(true);
  const success = await this.contractService.addPayment(c.id, {
    monto, fecha, metodo, tipo: 'abono',
    notas: notas || 'Pago registrado desde Event Hub',
    payment_splits: splits ?? [{ metodo: metodo as PaymentSplit['metodo'], monto }],
  });
```

**h) Find the amendment pay dialog initialization** — look for `amendPayMetodo.set('efectivo')` and replace with:
```typescript
this.amendPaySplits.set([{ metodo: 'efectivo', monto: this.amendPayMonto() }]);
```

**i) Find where amendment pay is registered** — look for where `amendPayMetodo()` is passed to `registerPayment` or `addPayment` and update it to use `amendPaySplits`:
```typescript
const amendSplits = this.amendPaySplits();
const amendMetodo = amendSplits.length === 1 ? amendSplits[0].metodo : 'combinado';
// pass amendMetodo and amendSplits to the payment registration
```

- [ ] **Step 2: Update `admin-event-detail.html`**

Read the file. Find the two payment method selects.

**Main pay dialog** (around lines 1385-1391):

Replace:
```html
<label class="block text-sm font-semibold text-slate-700 mb-1.5">Método</label>
<select
  [value]="payMetodo()"
  (change)="payMetodo.set($any($event.target).value)"
  ...>
  <option value="efectivo">Efectivo</option>
  <option value="tarjeta">Tarjeta</option>
  ...
</select>
```

With:
```html
<label class="block text-sm font-semibold text-slate-700 mb-1.5">Forma de pago</label>
<app-payment-splits-input
  [total]="payMonto()"
  [(splits)]="paySplits()"
/>
```

**Update submit button disabled condition** (around line 1409):

Replace:
```html
[disabled]="paySaving() || payMonto() <= 0"
```
With:
```html
[disabled]="paySaving() || payMonto() <= 0 || !paySplitsValid()"
```

**Amendment pay dialog** (around lines 1506-1511):

Replace the method select with:
```html
<label class="mb-1 block text-xs font-medium text-slate-600">Forma de pago</label>
<app-payment-splits-input
  [total]="amendPayMonto()"
  [(splits)]="amendPaySplits()"
/>
```

And update its submit button disabled condition to also check `!amendPaySplitsValid()`.

- [ ] **Step 3: Verify build**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | grep -E '(ERROR|✘|Output location)'
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts \
        src/app/features/admin/pages/admin-event-detail/admin-event-detail.html
git commit -m "feat(payments): integrate PaymentSplitsInput into event payment dialogs"
```

---

## Task 6: Integrate into `admin-pos` checkout

**Files:**
- Modify: `src/app/features/admin/pages/admin-pos/admin-pos.ts`
- Modify: `src/app/features/admin/pages/admin-pos/admin-pos.html`

**Context:** `admin-pos.ts` has `paymentMethod = signal<PaymentMethod>('efectivo')` (line 59). `checkout()` (line 599) calls `posService.registerSale(...)` passing `pagado_con: this.paymentMethod()` (line 611). The HTML has 3 method buttons (Efectivo / Tarjeta / Transferencia) at lines 433-440. `printSale(sale, cartSnapshot, cashierName)` is called after successful checkout.

**Consumes from Task 1:** `PaymentSplit`
**Consumes from Task 2:** `PaymentSplitsInputComponent`

- [ ] **Step 1: Update `admin-pos.ts`**

Read the full file first. Then:

**a) Add imports:**
```typescript
import type { PaymentSplit } from '../../../../core/interfaces/contract';
import { PaymentSplitsInputComponent } from '../../../../shared/components/payment-splits-input/payment-splits-input';
```

**b) Remove signal:**
```typescript
// DELETE this line (line ~59):
readonly paymentMethod  = signal<PaymentMethod>('efectivo');
```

**c) Add replacement signal:**
```typescript
readonly posSplits = signal<PaymentSplit[]>([]);
```

**d) Add computed signals:**
```typescript
readonly posSplitsValid = computed(() =>
  this.posSplits().length > 0 &&
  this.posSplits().every((s) => s.monto > 0) &&
  Math.abs(this.posSplits().reduce((acc, s) => acc + s.monto, 0) - this.cartTotal()) < 0.01
);
```

**e) Add cart initialization effect** — whenever the cart total changes and splits are empty or stale, reset to a single split. Find the constructor and add:

```typescript
effect(() => {
  const total = this.cartTotal();
  // Reset splits to single efectivo when cart changes to a new total
  // (only if splits are empty or the total changed significantly)
  const current = this.posSplits();
  if (current.length === 0) {
    this.posSplits.set([{ metodo: 'efectivo', monto: total }]);
  }
}, { allowSignalWrites: true });
```

**f) Also initialize splits when cart is cleared** — find `clearCart()` (line ~597) and add:
```typescript
clearCart(): void {
  this.cart.set([]);
  this.posSplits.set([]);
}
```

**g) Update `checkout()` (line ~607) — pass splits to `registerSale`:**

Replace:
```typescript
pagado_con: this.paymentMethod(),
```

With:
```typescript
const checkoutSplits  = this.posSplits();
const pagado_con      = checkoutSplits.length === 1 ? checkoutSplits[0].metodo : 'combinado';
```

And in the `registerSale` call add both fields:
```typescript
pagado_con,
payment_splits: checkoutSplits,
```

**h) Update `@Component` imports array** — add `PaymentSplitsInputComponent`.

- [ ] **Step 2: Update `admin-pos.html`**

Read the file. Find the 3-button payment method selector (around lines 433-440):

```html
@for (m of [['efectivo','Efectivo','pi-money-bill'],['tarjeta','Tarjeta','pi-credit-card'],['transferencia','Transfer.','pi-send']]; track m[0]) {
  <button (click)="paymentMethod.set($any(m[0]))"
    ...>
    ...
  </button>
}
```

Replace the entire `@for` block with:

```html
<app-payment-splits-input
  [total]="cartTotal()"
  [(splits)]="posSplits()"
/>
```

**Update the "Cobrar" button disabled condition** — find the Cobrar button (around line 449-455) and ensure it also checks `!posSplitsValid()`:

Find the button that calls `checkout()` and add `|| !posSplitsValid()` to its `[disabled]` binding.

Note: The Cobrar button (line ~453) currently shows `{{ cartTotal() | currency:'MXN':'symbol-narrow':'1.0-0' }}` — do NOT change this, it is pre-existing and out of scope.

- [ ] **Step 3: Verify build**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | grep -E '(ERROR|✘|Output location)'
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/admin/pages/admin-pos/admin-pos.ts \
        src/app/features/admin/pages/admin-pos/admin-pos.html
git commit -m "feat(payments): integrate PaymentSplitsInput into POS checkout"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ DB JSONB column added to both tables with backfill (Task 1)
- ✅ TypeScript interfaces updated (Task 1)
- ✅ Shared UI component with auto-fill remainder (Task 2)
- ✅ ESC/POS receipt updated (Task 3, Steps 1 & 3)
- ✅ HTML receipt updated (Task 3, Steps 2 & 4)
- ✅ Drawer kick when any split is efectivo (Task 3, Steps 1 & 3)
- ✅ Anticipo dialog (Task 4)
- ✅ Event payment dialog — main and amendment (Task 5)
- ✅ POS checkout (Task 6)
- ✅ Submit disabled when splits don't sum to total (Tasks 4, 5, 6)
- ✅ Max 3 methods; no duplicate methods (Task 2 component logic)
- ✅ Backward compat: `metodo`/`pagado_con` derived as 'combinado' for multi-split (Tasks 4, 5, 6)
- ✅ Backward compat on receipt: fallback to single-method if `payment_splits` absent (Task 3 — uses `?? [{ metodo, monto }]` fallback)

**Type consistency:**
- `PaymentSplit` defined once in `contract.ts`, imported in `pos.ts` and all components
- `'combinado'` added to both `ContractPayment.metodo` and `PaymentMethod`
- `anticoSplits`, `paySplits`, `amendPaySplits`, `posSplits` — consistent naming pattern
