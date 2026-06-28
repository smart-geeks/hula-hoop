# Diseño: Pagos con Métodos Combinados

**Fecha:** 2026-06-28  
**Autor:** Eduardo Baltazar + Claude

---

## Objetivo

Permitir registrar un pago único dividido en múltiples métodos de pago (efectivo, tarjeta, transferencia) en los tres contextos donde se registran pagos: anticipo de cotización, abono/liquidación de evento, y checkout del POS. El recibo impreso debe mostrar todos los métodos en un solo documento.

## Alcance

Tres puntos de integración:
1. **`/admin/cotizaciones`** — diálogo de anticipo inicial (crea el contrato)
2. **`/admin/evento/:id`** — diálogo de abonos y liquidaciones
3. **`/admin/pos`** — pantalla de checkout del punto de venta

## Arquitectura

### Tipo compartido `PaymentSplit`

Se agrega a `src/app/core/interfaces/contract.ts` (donde ya vive `ContractPayment`):

```typescript
export interface PaymentSplit {
  metodo: 'efectivo' | 'tarjeta' | 'transferencia';
  monto: number; // en pesos (no centavos)
}
```

Este tipo es el único que viaja entre el componente UI y los servicios. No se crea un tipo separado en `pos.ts` para evitar duplicación.

### Regla de derivación de `metodo` / `pagado_con`

Al guardar en DB, siempre se escribe la columna JSONB **y** se deriva el campo de texto existente:

```
splits.length === 1  →  metodo / pagado_con = splits[0].metodo
splits.length  >  1  →  metodo / pagado_con = 'combinado'
```

Esto garantiza que todo código existente que lea `metodo` o `pagado_con` siga funcionando.

---

## Base de Datos

### Migración única

Archivo: `supabase/migrations/20260628000003_add_payment_splits.sql`

```sql
-- contract_payments: agrega columna JSONB y backfill
ALTER TABLE contract_payments
  ADD COLUMN IF NOT EXISTS payment_splits JSONB;

UPDATE contract_payments
SET payment_splits = jsonb_build_array(
  jsonb_build_object('metodo', metodo, 'monto', monto)
)
WHERE payment_splits IS NULL;

ALTER TABLE contract_payments
  ALTER COLUMN payment_splits SET NOT NULL,
  ALTER COLUMN payment_splits SET DEFAULT '[]'::jsonb;

-- pos_sales: ídem
ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS payment_splits JSONB;

UPDATE pos_sales
SET payment_splits = jsonb_build_array(
  jsonb_build_object('metodo', pagado_con, 'monto', total)
)
WHERE payment_splits IS NULL;

ALTER TABLE pos_sales
  ALTER COLUMN payment_splits SET NOT NULL,
  ALTER COLUMN payment_splits SET DEFAULT '[]'::jsonb;
```

### Cambios de interfaces TypeScript

**`src/app/core/interfaces/contract.ts`:**
- Agregar `export interface PaymentSplit { metodo, monto }`
- Agregar `payment_splits: PaymentSplit[]` a `ContractPayment`
- Agregar `'combinado'` al union de `ContractPayment.metodo`

**`src/app/core/interfaces/pos.ts`:**
- Agregar `payment_splits: PaymentSplit[]` a `PosSale`
- Agregar `payment_splits: PaymentSplit[]` a `CreateSaleData`
- Agregar `'combinado'` al union de `PaymentMethod`

---

## Componente compartido `PaymentSplitsInputComponent`

### Ubicación
```
src/app/shared/components/payment-splits-input/
  payment-splits-input.ts
  payment-splits-input.html
```

### API

```typescript
// Inputs / Outputs
total   = input.required<number>();          // total a cobrar en pesos
splits  = model<PaymentSplit[]>();           // two-way binding

// Computed interno
remaining = computed(() =>
  this.total() - this.splits().reduce((s, sp) => s + sp.monto, 0)
);
isValid = computed(() =>
  this.splits().length > 0 &&
  this.splits().every(sp => sp.monto > 0) &&
  Math.abs(this.remaining()) < 0.01
);
```

### Comportamiento

- **Estado inicial:** Una sola fila: `[{ metodo: 'efectivo', monto: total }]`
- **Botón "÷ Dividir pago":** Visible mientras `splits.length < 3`. Al hacer clic:
  - Reduce el monto de la primera fila a 0 si era el total completo, o lo deja igual
  - Agrega fila `{ metodo: 'tarjeta', monto: remaining() }`
- **Al cambiar monto de cualquier fila:** Si solo hay 2 filas, la segunda se auto-actualiza a `total - fila1.monto` (comportamiento POS estándar)
- **Botón `×`:** Elimina fila; mínimo 1 fila siempre
- **Máximo:** 3 filas
- **Selector de método:** dropdown o tres botones (efectivo / tarjeta / transferencia); no se puede repetir el mismo método en dos filas
- **Validación visual:** Muestra saldo restante en tiempo real; el monto restante se pone en rojo si ≠ 0

### Template (estructura conceptual)

```html
@for (split of splits(); track $index) {
  <div class="flex gap-2 items-center">
    <!-- Selector de método -->
    <select [(ngModel)]="...">
      @for (m of availableMethods($index); track m) { <option>... }
    </select>
    <!-- Monto -->
    <input type="number" [value]="split.monto" (input)="onMontoChange($index, $event)" />
    <!-- Quitar (solo si hay >1 fila) -->
    @if (splits().length > 1) {
      <button type="button" (click)="removeSplit($index)">×</button>
    }
  </div>
}

@if (remaining() !== 0) {
  <p class="text-red-600">Saldo restante: {{ remaining() | currencyMxn }}</p>
}

@if (splits().length < 3) {
  <button type="button" (click)="addSplit()">÷ Dividir pago</button>
}
```

---

## Integración en los 3 contextos

### 1. Anticipo de cotización (`admin-quotes`)

**Cambios en `.ts`:**
- Eliminar signal `anticoMetodo = signal<PayMethod>('efectivo')`
- Agregar `anticoSplits = signal<PaymentSplit[]>([])`
- En `openAnticoDialog()`: inicializar `anticoSplits.set([{ metodo: 'efectivo', monto: depositAmount }])`
- En `submitAnticipo()`:
  - Derivar `metodo = splits.length === 1 ? splits[0].metodo : 'combinado'`
  - Pasar `payment_splits: this.anticoSplits()` al service

**Cambios en `.html`:**
- Reemplazar `<select [(ngModel)]="anticoMetodo">` con `<app-payment-splits-input [total]="anticoMonto()" [(splits)]="anticoSplits()" />`
- El botón Guardar queda `[disabled]` cuando `!anticoSplitsValid()` (computed del componente hijo expuesto via output o validación local)

### 2. Pago en evento (`admin-event-detail`)

**Cambios en `.ts`:**
- Eliminar signal `payMetodo = signal<PayMethod>('efectivo')`
- Agregar `paySplits = signal<PaymentSplit[]>([])`
- En `openPayDialog()`: `paySplits.set([{ metodo: 'efectivo', monto: saldo_pendiente }])`
- En `submitPayment()`:
  - Derivar metodo del split
  - Pasar `payment_splits` al service de registro

**Cambios en `.html`:**
- Reemplazar selector de método con `<app-payment-splits-input [total]="payMonto()" [(splits)]="paySplits()" />`

### 3. POS checkout (`admin-pos`)

**Cambios en `.ts`:**
- Eliminar signal `paymentMethod = signal<PaymentMethod>('efectivo')`
- Agregar `posSplits = signal<PaymentSplit[]>([])`
- En `checkout()`:
  - Inicializar `posSplits` al momento de abrir checkout si aún está vacío: `[{ metodo: 'efectivo', monto: cartTotal() }]`
  - Pasar `payment_splits: this.posSplits()` a `registerSale()`
  - Derivar `pagado_con = splits.length === 1 ? splits[0].metodo : 'combinado'`

**Cambios en `.html`:**
- Reemplazar los 3 botones de método (Efectivo / Tarjeta / Transferencia) con `<app-payment-splits-input [total]="cartTotal()" [(splits)]="posSplits()" />`

---

## Servicio: `ContractService` y `PosService`

### `ContractService` — método `addPayment()`

El método existente que crea una fila en `contract_payments` recibe el payload actualizado:

```typescript
// Antes
addPayment(contractId, monto, fecha, metodo, tipo, notas)

// Después
addPayment(contractId, { monto, fecha, tipo, notas, splits: PaymentSplit[] })
// Internamente deriva: metodo = splits.length === 1 ? splits[0].metodo : 'combinado'
// Escribe: metodo (derivado) + payment_splits (JSON.stringify(splits))
```

### `PosService.registerSale()`

Acepta `payment_splits: PaymentSplit[]` en `CreateSaleData`. Deriva e inserta `pagado_con`.

---

## Recibo (`PosTicketPrintService`)

### `printPayment(contract, payment, quote)`

El bloque de forma de pago en el recibo cambia de:
```
MÉTODO DE PAGO:  EFECTIVO          $5,000.00
```
a:
```
FORMA DE PAGO
  EFECTIVO                         $1,200.00
  TARJETA                          $3,800.00
─────────────────────────────────────────────
TOTAL PAGADO                       $5,000.00
```

Lee desde `payment.payment_splits`. Si `payment_splits` tiene 1 elemento, el formato es la línea simple existente (sin cambio visual perceptible). Si tiene >1, itera e imprime una línea por método.

Aplica tanto al path **ESC/POS** (`buildPaymentEscPos()` o equivalente) como al path **HTML** (`buildPaymentHtml()`).

### `printSale(sale, cartItems, cashierName)`

Mismo tratamiento usando `sale.payment_splits`.

---

## Archivos modificados / creados

| Acción | Archivo |
|---|---|
| CREATE | `supabase/migrations/20260628000003_add_payment_splits.sql` |
| CREATE | `src/app/shared/components/payment-splits-input/payment-splits-input.ts` |
| CREATE | `src/app/shared/components/payment-splits-input/payment-splits-input.html` |
| MODIFY | `src/app/core/interfaces/contract.ts` |
| MODIFY | `src/app/core/interfaces/pos.ts` |
| MODIFY | `src/app/core/services/pos-ticket-print.service.ts` |
| MODIFY | `src/app/core/services/contract.service.ts` |
| MODIFY | `src/app/core/services/pos.service.ts` |
| MODIFY | `src/app/features/admin/pages/admin-quotes/admin-quotes.ts` |
| MODIFY | `src/app/features/admin/pages/admin-quotes/admin-quotes.html` |
| MODIFY | `src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts` |
| MODIFY | `src/app/features/admin/pages/admin-event-detail/admin-event-detail.html` |
| MODIFY | `src/app/features/admin/pages/admin-pos/admin-pos.ts` |
| MODIFY | `src/app/features/admin/pages/admin-pos/admin-pos.html` |

---

## Restricciones técnicas (Angular 20 zoneless)

- `PaymentSplitsInputComponent` usa `ChangeDetectionStrategy.OnPush`, sin `standalone: true`
- Sin `NgZone`, sin `ChangeDetectorRef`
- `model<PaymentSplit[]>()` para two-way binding (Angular signals API)
- `| currencyMxn` para montos — nunca `| currency:'MXN':...`
- `@for`, `@if` nativos — sin `*ngFor`, `*ngIf`
- Sin `ngClass`, sin `ngStyle`

---

## Criterios de aceptación

1. Se puede registrar un pago de $5,000 dividido en $1,200 efectivo + $3,800 tarjeta desde cotizaciones, evento, y POS
2. El recibo impreso (térmica o navegador) muestra ambos métodos con sus montos
3. Registros existentes en DB siguen siendo legibles (backfill correcto)
4. Código que lee `metodo` / `pagado_con` textual sigue funcionando (retrocompatibilidad)
5. El botón de confirmar pago queda deshabilitado mientras la suma de splits ≠ total
6. Máximo 3 métodos de pago simultáneos
7. No se puede repetir el mismo método en dos filas de un mismo pago
8. Build: zero errores TypeScript/Angular
