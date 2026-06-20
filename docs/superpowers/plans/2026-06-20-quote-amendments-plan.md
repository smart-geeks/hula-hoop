# Implementation Plan: Quote Amendments (Modificaciones Post-Firma)

**Spec:** `docs/superpowers/specs/2026-06-20-quote-amendments-design.md`  
**Date:** 2026-06-20

---

## Phase 0: Documentation Discovery (Done)

### Confirmed Patterns

**Services pattern** (`contract.service.ts`, `extra.service.ts`):
```typescript
@Injectable({ providedIn: 'root' })
export class XxxService {
  private readonly supabase = inject(SupabaseService);
  async getById(id: string): Promise<Xxx | null> { ... }
}
```

**Component pattern** (`admin-event-detail.ts`):
- `ChangeDetectionStrategy.OnPush`
- `signal()` for all state, `computed()` for derived
- `constructor()` → calls `private async loadXxx()`
- Toast: `signal<{type,message}|null>(null)` → `setTimeout(() => toast.set(null), 3000)`
- Dialogs: `signal(false)` para visibilidad, rendered with `@if` inline (no PrimeNG Dialog en este componente)
- Currency pipe: `| currency:'MXN':'symbol-narrow':'1.0-0'` (sin 4to param)
- `[class]` bindings, NUNCA `ngClass`
- Control flow: `@if`, `@for`, `@switch`

**`addPayment` signature** (contract.service.ts:234):
```typescript
async addPayment(
  contractId: string,
  payment: Omit<ContractPayment, 'id' | 'contract_id' | 'created_at'>
): Promise<boolean>
```
Currently inserts into `contract_payments` then calls `update()` with new `deposito_pagado`.

**`Extra` interface** (extra.ts):
```typescript
{ id, name, description, price_cents, pay_at_venue, is_active, sort_order, created_at, updated_at }
```

**`ExtraService.getActiveExtrasByVenue(venueId)`** — usar para cargar catálogo.

**Public portal** (`contract-public-page.ts`):
- Carga contrato por `id` (route param)
- Usa `inject()` + `signal()` + `ChangeDetectionStrategy.OnPush`
- Wizard de pasos con `@if (currentStep() === N)`
- NO usa PrimeNG Dialog — todo inline

**Migrations:** Último número usado → `20260615000003`. Próxima: `20260620000001`.

---

## Phase 1: Database Migration

**Objetivo:** Crear tabla `quote_amendments` y agregar columna `tipo` a `contract_payments`.

**Archivo a crear:**
`supabase/migrations/20260620000001_quote_amendments.sql`

**Contenido exacto:**

```sql
-- 1. Nueva columna tipo en contract_payments
ALTER TABLE contract_payments
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'abono'
  CHECK (tipo IN ('anticipo', 'abono', 'liquidacion', 'extra'));

-- 2. Tabla quote_amendments
CREATE TABLE IF NOT EXISTS quote_amendments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id           UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  contract_id        UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected')),
  proposed_items     JSONB NOT NULL DEFAULT '[]',
  proposed_subtotal  INTEGER NOT NULL DEFAULT 0,
  proposed_descuento INTEGER NOT NULL DEFAULT 0,
  proposed_total     INTEGER NOT NULL DEFAULT 0,
  delta_monto        INTEGER NOT NULL DEFAULT 0,
  payment_id         UUID REFERENCES contract_payments(id),
  approval_token     TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  notas              TEXT,
  created_by         UUID REFERENCES profiles(id),
  approved_at        TIMESTAMPTZ,
  rejected_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. RLS
ALTER TABLE quote_amendments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage amendments"
  ON quote_amendments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'owner')
    )
  );

-- Lectura pública solo por token (el portal lo filtra por WHERE approval_token = $token)
CREATE POLICY "Public read amendments"
  ON quote_amendments FOR SELECT
  USING (true);
```

**Aplicar con:**
```bash
# Verificar que Supabase MCP apunta al proyecto correcto: jzdfxbbnhkzdetrpmqdx
# Usar mcp__claude_ai_Supabase__apply_migration
```

**Verificación:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'contract_payments' AND column_name = 'tipo';

SELECT table_name FROM information_schema.tables
WHERE table_name = 'quote_amendments';
```

---

## Phase 2: TypeScript Infrastructure

**Objetivo:** Crear interfaz `QuoteAmendment`, actualizar `ContractPayment`, crear `QuoteAmendmentService`.

### 2.1 — Actualizar `ContractPayment` interface

**Archivo:** `src/app/core/interfaces/contract.ts`

Agregar campo `tipo` a `ContractPayment`:
```typescript
export interface ContractPayment {
  id: string;
  contract_id: string;
  monto: number;
  fecha: string;
  metodo: 'efectivo' | 'tarjeta' | 'transferencia';
  tipo: 'anticipo' | 'abono' | 'liquidacion' | 'extra';  // ← nuevo
  notas: string | null;
  created_at: string;
}
```

### 2.2 — Actualizar `ContractService.addPayment`

**Archivo:** `src/app/core/services/contract.service.ts`

El método acepta `Omit<ContractPayment, 'id'|'contract_id'|'created_at'>` — como `tipo` ya está en la interfaz, pasa automáticamente. Solo verificar que el INSERT no tiene campos hardcodeados que excluyan `tipo`.

Si el insert es un spread del objeto `payment`, no hay nada que cambiar. Si filtra campos, agregar `tipo`.

### 2.3 — Nueva interfaz `QuoteAmendment`

**Archivo a crear:** `src/app/core/interfaces/quote-amendment.ts`

```typescript
export type AmendmentStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';

export interface AmendmentItem {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface QuoteAmendment {
  id: string;
  quote_id: string;
  contract_id: string;
  status: AmendmentStatus;
  proposed_items: AmendmentItem[];
  proposed_subtotal: number;
  proposed_descuento: number;
  proposed_total: number;
  delta_monto: number;
  payment_id: string | null;
  approval_token: string;
  notas: string | null;
  created_by: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
}
```

### 2.4 — Nuevo `QuoteAmendmentService`

**Archivo a crear:** `src/app/core/services/quote-amendment.service.ts`

Seguir el patrón de `contract.service.ts` y `extra.service.ts`:

```typescript
@Injectable({ providedIn: 'root' })
export class QuoteAmendmentService {
  private readonly supabase = inject(SupabaseService);

  // Obtener amendment activo de un contrato (draft o pending_approval)
  async getActiveByContract(contractId: string): Promise<QuoteAmendment | null>

  // Obtener por token público (para el portal del cliente)
  async getByToken(token: string): Promise<QuoteAmendment | null>

  // Crear amendment en estado 'draft'
  async createDraft(data: {
    quote_id: string;
    contract_id: string;
    proposed_items: AmendmentItem[];
    proposed_subtotal: number;
    proposed_descuento: number;
    proposed_total: number;
    delta_monto: number;
    notas?: string;
    created_by?: string;
  }): Promise<QuoteAmendment | null>

  // Actualizar draft (admin sigue editando)
  async updateDraft(id: string, data: Partial<Pick<QuoteAmendment,
    'proposed_items' | 'proposed_subtotal' | 'proposed_descuento' | 'proposed_total' | 'delta_monto' | 'notas'
  >>): Promise<QuoteAmendment | null>

  // Vincular pago y cambiar status a pending_approval
  async linkPaymentAndSubmit(id: string, paymentId: string): Promise<QuoteAmendment | null>

  // Cliente aprueba: aplica cambios a quote_items + actualiza contract totals
  async approve(token: string, quoteService: QuoteService, contractService: ContractService): Promise<boolean>

  // Cliente rechaza
  async reject(token: string): Promise<boolean>
}
```

**Lógica de `approve()`:**
1. `getByToken(token)` → obtener amendment
2. Validar `status === 'pending_approval'`
3. `quoteService.updateFull(amendment.quote_id, { items: amendment.proposed_items, subtotal, descuento, total })` — usar método existente que ya reemplaza items
4. `contractService.update(amendment.contract_id, { total_contrato: amendment.proposed_total, saldo_pendiente: contrato_actual.saldo_pendiente + amendment.delta_monto })`
5. UPDATE `quote_amendments SET status='approved', approved_at=now()` WHERE id = amendment.id

**Anti-patterns:**
- NO usar `inject()` con servicios hermanos si hay riesgo de circular dependency — pasar como parámetro
- NO llamar `updateFull` sin cargar el quote antes para tener los datos completos de items (solo se necesitan los proposed_items que ya están en JSONB)

**Verificación:**
```bash
npx tsc --noEmit 2>&1 | head -30
```

---

## Phase 3: Admin UI — Editor de Amendments en Event Detail

**Objetivo:** Agregar modo edición inline en la pestaña Cotización del `admin-event-detail`.

### 3.1 — Signals nuevos en `admin-event-detail.ts`

Seguir patrón de signals existentes en el archivo:

```typescript
// Amendment state
readonly amendment        = signal<QuoteAmendment | null>(null);
readonly amendmentEditing = signal(false);
readonly amendmentItems   = signal<AmendmentItem[]>([]);
readonly amendmentNotas   = signal('');
readonly amendmentSaving  = signal(false);
readonly availableExtras  = signal<Extra[]>([]);

// Post-payment modal
readonly amendPayDialog      = signal(false);
readonly amendPayMonto        = signal(0);
readonly amendPayFecha        = signal('');
readonly amendPayMetodo       = signal<PayMethod>('efectivo');
readonly amendPayNotas        = signal('');
readonly amendPaySaving       = signal(false);
readonly sendLinkDialog       = signal(false);

// Computed
readonly amendmentDelta = computed(() => {
  const q = this.quote();
  if (!q) return 0;
  const originalTotal = q.total ?? 0;
  const newTotal = this.amendmentItems().reduce((s, i) => s + i.subtotal, 0);
  return newTotal - originalTotal;
});
```

### 3.2 — Inyecciones nuevas en constructor

```typescript
private readonly amendmentService = inject(QuoteAmendmentService);
private readonly extraService     = inject(ExtraService);
private readonly authService      = inject(AuthService); // ya existe
```

### 3.3 — Métodos nuevos en `admin-event-detail.ts`

```typescript
// Iniciar edición: carga extras del catálogo, copia items actuales del quote
async startAmendmentEdit(): Promise<void>

// Agregar item del catálogo
addExtraFromCatalog(extra: Extra): void

// Agregar línea libre
addFreeLineItem(): void

// Actualizar cantidad/precio de un item
updateItemQty(index: number, qty: number): void
updateItemPrice(index: number, price: number): void

// Eliminar item
removeItem(index: number): void

// Cancelar edición (sin guardar)
cancelAmendmentEdit(): void

// Guardar draft y abrir modal de pago
async saveAmendmentAndOpenPayment(): Promise<void>
// → createDraft() si no existe, updateDraft() si ya existe
// → abre amendPayDialog

// Registrar pago del extra
async submitAmendmentPayment(): Promise<void>
// → contractService.addPayment(..., tipo: 'extra')
// → amendmentService.linkPaymentAndSubmit(amendmentId, paymentId)
// → cierra amendPayDialog, abre sendLinkDialog

// Cerrar send link dialog
closeSendLinkDialog(): void

// WhatsApp/Email helpers
getAmendmentWhatsappLink(): string
getAmendmentEmailLink(): string
```

### 3.4 — Llamar a `loadData()` incluyendo amendment

En `loadData()` agregar:
```typescript
const activeAmendment = await this.amendmentService.getActiveByContract(id);
this.amendment.set(activeAmendment);
```

### 3.5 — HTML: Pestaña Cotización

**Archivo:** `admin-event-detail.html` — sección de la pestaña `cotizacion`

Estructura a implementar (siguiendo patrones del archivo: `@if`, `[class]`, currency pipe):

```
@if (!amendmentEditing()) {
  <!-- Vista normal: tabla de items del quote -->
  <!-- Badge si hay amendment pendiente: chip amarillo "Pendiente de autorización del cliente" -->
  <!-- Botón "Modificar Cotización" solo si contract.estado === 'firmado' y sin amendment pending_approval -->
} @else {
  <!-- Modo edición inline -->
  <!-- Tabla editable de items con qty/precio/eliminar por fila -->
  <!-- Sección "+ Agregar del catálogo" (select de extras) -->
  <!-- Sección "+ Línea libre" (inputs descripción + precio) -->
  <!-- Footer: Subtotal original / Subtotal nuevo / Diferencia en naranja -->
  <!-- Botones: Cancelar | "Guardar y Registrar Pago →" -->
}
```

**Modal pago del extra** (inline, misma estructura que modal de pagos existente):
```
@if (amendPayDialog()) {
  <!-- Overlay + panel -->
  <!-- Monto (pre-rellenado con delta) -->
  <!-- Fecha / Método -->
  <!-- Notas pre-rellenadas -->
  <!-- Botones: Cancelar | Confirmar Pago -->
}
```

**Modal "Enviar al cliente"** (simple, solo botones):
```
@if (sendLinkDialog()) {
  <!-- "✅ Pago de $X,XXX registrado" -->
  <!-- "¿Deseas enviar los cambios al cliente para autorización?" -->
  <!-- [WhatsApp ↗] [Email ↗] [Copiar link] -->
  <!-- [Cerrar] -->
}
```

**Anti-patterns:**
- NO usar `ngClass` — usar `[class]` con string condicional
- NO usar `async ngOnInit` — todo en `constructor()` + métodos privados
- NO pasar `'es-MX'` como 4to param del currency pipe

**Verificación:**
```bash
npx tsc --noEmit 2>&1 | head -30
npm run build 2>&1 | tail -20
```

---

## Phase 4: Portal Público — Aprobación del Cliente

**Objetivo:** Mostrar banner de amendment pendiente en `/contrato/:id` con botones Autorizo / Rechazar.

### 4.1 — `contract-public-page.ts`

Agregar signals:
```typescript
readonly amendment = signal<QuoteAmendment | null>(null);
readonly amendmentApproving = signal(false);
readonly amendmentRejecting = signal(false);
readonly amendmentDone      = signal<'approved' | 'rejected' | null>(null);
```

En `loadContract(id)` agregar:
```typescript
const activeAmendment = await this.amendmentService.getByToken(???);
```

**Problema:** El portal actual carga por `contract.id`, no por `approval_token`. Hay dos opciones:
- **Opción recomendada:** Cargar el contrato por id (como ahora), luego buscar amendment activo por `contract_id`:
  ```typescript
  const amendment = await this.amendmentService.getActiveByContractId(contractId);
  // donde status = 'pending_approval'
  ```
- Agregar método `getByContractPublic(contractId)` que filtre por `status = 'pending_approval'`

Métodos nuevos:
```typescript
async approveAmendment(): Promise<void>  // → amendmentService.approve(token)
async rejectAmendment(): Promise<void>   // → amendmentService.reject(token)
```

### 4.2 — `contract-public-page.html`

Agregar banner ANTES del wizard de firma (siguiendo el patrón `@if` del archivo):

```html
@if (amendment() && amendment()!.status === 'pending_approval') {
  <section class="...">
    <h3>📋 Modificación pendiente de autorización</h3>
    <!-- Tabla: items propuestos con ➕ en los nuevos vs los originales -->
    <!-- Total anterior / Total nuevo / Diferencia -->
    <!-- "Ya pagado: $X (pago del [fecha])" -->

    @if (amendmentDone() === 'approved') {
      <p class="text-emerald-600">✅ Cambios autorizados. ¡Gracias!</p>
    } @else if (amendmentDone() === 'rejected') {
      <p class="text-slate-500">Cambios rechazados. Nos pondremos en contacto contigo.</p>
    } @else {
      <button (click)="approveAmendment()" [disabled]="amendmentApproving()">
        ✓ Autorizo los cambios
      </button>
      <button (click)="rejectAmendment()" [disabled]="amendmentRejecting()">
        Rechazar
      </button>
    }
  </section>
}
```

**Anti-patterns:**
- NO usar `ngClass`
- Mantener mismo sistema de `@if` para el wizard (no romper flujo existente)

**Verificación:**
```bash
npx tsc --noEmit 2>&1 | head -30
```

---

## Phase 5: Integración Financiera — Corte de Caja

**Objetivo:** Incluir `contract_payments` del día en el corte de caja diario.

**Tarea previa:** Encontrar el componente de corte de caja:
```bash
find src -type f | grep -i corte
find src -type f | grep -i caja
find src -type f | grep -i cierre
```

Una vez localizado, el query del resumen diario debe incluir:
```typescript
// Agregar al query de cierre de caja
const { data: contractPayments } = await client
  .from('contract_payments')
  .select('monto, metodo, tipo')
  .gte('created_at', `${today}T00:00:00`)
  .lte('created_at', `${today}T23:59:59`);

// Agrupar por tipo para mostrar desglose:
// Anticipo: $X | Extra: $X | Abono: $X | Liquidación: $X
// Total contratos: $X (sumado a total del día)
```

**Anti-patterns:**
- NO cambiar el query del POS `pos_sales` — solo agregar los contract_payments como línea adicional
- NO mezclar pos_sales y contract_payments en la misma suma sin etiquetar

**Verificación:**
- Registrar un pago de tipo 'extra' → verificar que aparece en el resumen del corte de caja del día

---

## Phase 6: Build Final y Verificación

**Verificación completa:**

```bash
# 1. TypeScript
npx tsc --noEmit

# 2. Build de producción
npm run build

# 3. Verificar que no se usa ngClass en los archivos nuevos/modificados
grep -n "ngClass" src/app/features/admin/pages/admin-event-detail/admin-event-detail.html
grep -n "ngClass" src/app/features/contracts/pages/contract-public-page/contract-public-page.html

# 4. Verificar currency pipe sin 4to param
grep -n "'es-MX'" src/app/features/admin/pages/admin-event-detail/admin-event-detail.html
grep -n "'es-MX'" src/app/features/contracts/pages/contract-public-page/contract-public-page.html

# 5. Verificar migration aplicada
# mcp__claude_ai_Supabase__execute_sql:
# SELECT * FROM quote_amendments LIMIT 1;
# SELECT tipo FROM contract_payments LIMIT 1;
```

**Flujo de prueba manual:**
1. Ir a `/admin/evento/:id` con contrato en estado 'firmado'
2. Pestaña Cotización → clic "Modificar Cotización"
3. Agregar un extra del catálogo y una línea libre
4. Verificar que el delta se calcula correctamente
5. Guardar → Modal de pago → confirmar con monto del delta
6. Modal "Enviar al cliente" → copiar link
7. Abrir link en otra pestaña → ver banner de amendment
8. Clic "Autorizo los cambios"
9. Verificar en admin que quote_items se actualizó y contract.total_contrato refleja el nuevo total
10. Verificar en corte de caja que el pago del extra aparece

---

## Orden de Ejecución

```
Phase 1 (Migration) → Phase 2 (TS Infrastructure) → Phase 3 (Admin UI) → Phase 4 (Portal) → Phase 5 (Caja) → Phase 6 (Verify)
```

Phases 3 y 4 pueden hacerse en paralelo una vez completada la Phase 2.
