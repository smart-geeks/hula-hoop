# Quote-First Unified Flow — Diseño Quirúrgico

**Fecha:** 2026-06-22  
**Estado:** Aprobado para implementación  
**Contexto:** Unificación de flujos de reserva privada en torno a `quotes` como única entidad de origen antes de `contracts`.

---

## 1. Resumen Ejecutivo

Se elimina la tabla `private_reservations` del flujo principal. Ambos caminos (online y back-office) crean primero una `quote` con todos los datos correctos. El pago (online por MercadoPago o en caja por el admin) convierte la quote en un `contract`. La route `/reserva/:accessToken` desaparece; en su lugar existe `/cotizacion/:token`.

```
[Online Wizard]   →  QuoteService.create()  →  Quote (completa)
[Admin Wizard]    →  QuoteService.create()  →  Quote (completa)
                                                     │
                              /cotizacion/:token (página pública, botón Pagar)
                                                     │
                          ┌──────────────────────────┤
                          │                          │
                   [Pago online MP]          [Admin registra en caja]
                          │                          │
                   mp-webhook edge fn         submitAnticipo()
                          │                          │
                          └───────────┬──────────────┘
                                      ▼
                                  CONTRACT
                                 (slot fijo)
```

`playdate_reservations` **no se toca**. Todo lo relacionado a playdates permanece igual.

---

## 2. Estado actual a preservar (NO ROMPER)

| Componente | Estado | Notas |
|---|---|---|
| Admin quote wizard (4 pasos) | ✅ Funciona | Solo agregar `time_slot_id` |
| `submitAnticipo()` | ✅ Funciona | Ya checa conflictos, crea contract con hora_inicio/hora_fin |
| Contract pages (detail, edit, payments) | ✅ Sin cambio | |
| `fn_check_slot_conflict` RPC | ✅ Existe | Solo quitar la rama de private_reservations |
| `fn_get_booked_dates` RPC | ✅ Existe | Solo quitar la rama de private_reservations |
| Admin quotes conflict detection | ✅ Funciona | checkConflictsForPendingQuotes + reschedule dialog |
| Playdate reservations flow | ✅ Sin cambio | Completamente separado |
| Todos los reportes y contratos | ✅ Sin cambio | |

---

## 3. Cambios en Base de Datos

### 3.1 Nuevas columnas en `quotes`

```sql
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS time_slot_id    UUID REFERENCES time_slots(id),
  ADD COLUMN IF NOT EXISTS mp_preference_id TEXT,
  ADD COLUMN IF NOT EXISTS snack_option_id UUID REFERENCES snack_options(id),
  ADD COLUMN IF NOT EXISTS package_id      UUID REFERENCES packages(id);
```

Las columnas `public_token`, `hora_inicio`, `hora_fin`, `guest_count`, `deposit_amount` **ya existen** en la tabla.

### 3.2 Actualizar `fn_check_slot_conflict`

Eliminar el segundo bloque que hace JOIN a `private_reservations`. Solo queda la verificación contra `contracts`:

```sql
CREATE OR REPLACE FUNCTION fn_check_slot_conflict(...)
-- Solo checa contracts WHERE estado NOT IN ('cancelado')
-- Eliminar: SELECT COUNT(*) FROM private_reservations pr JOIN time_slots...
```

### 3.3 Actualizar `fn_get_booked_dates`

Eliminar el segundo `RETURN QUERY` que hace JOIN a `private_reservations`. Solo queda el de `contracts`.

### 3.4 Eliminar triggers obsoletos

```sql
DROP TRIGGER IF EXISTS trg_reservation_on_insert ON private_reservations;
DROP FUNCTION IF EXISTS fn_reservation_on_insert();
DROP TRIGGER IF EXISTS trg_reservation_confirmed ON private_reservations;
DROP FUNCTION IF EXISTS fn_reservation_confirmed_to_contract();
```

### 3.5 Eliminar tablas obsoletas

```sql
DROP TABLE IF EXISTS private_reservation_extras CASCADE;
DROP TABLE IF EXISTS private_reservations CASCADE;
```

> **Orden correcto**: primero triggers, luego tablas. Los datos son de prueba — sin migración de registros.

---

## 4. Edge Functions

### 4.1 `create-payment` — Agregar tipo `'quote'`

**Input nuevo (además de los existentes):**
```json
{ "reservation_id": "<quote_uuid>", "reservation_type": "quote" }
```

**Lógica adicional en la función:**
```typescript
if (reservation_type === 'quote') {
  // 1. Fetch quote JOIN client
  const { data: quote } = await supabase
    .from('quotes')
    .select('*, client:clients(nombre, email)')
    .eq('id', reservation_id)
    .single()

  if (!quote) return 404

  // 2. Build items
  const chargeCents = Math.round((quote.deposit_amount ?? quote.total) * 100)
  items.push({
    title: 'Anticipo – Fiesta Privada',
    quantity: 1,
    unit_price: chargeCents / 100,
    currency_id: 'MXN',
  })

  // 3. Create MP preference
  // back_urls → /cotizacion/${quote.public_token}?status=...
  // external_reference → quote:${reservation_id}
  // payer: { name: quote.client.nombre, email: quote.client.email }

  // 4. Store mp_preference_id
  await supabase
    .from('quotes')
    .update({ mp_preference_id: mpData.id })
    .eq('id', reservation_id)
}
```

El `reservation_type === 'private'` original **no se toca** (aunque la ruta ya no lo use, mantenerlo no hace daño hasta limpieza final).

### 4.2 `mp-webhook` — Agregar rama `'quote'`

El webhook parsea `external_reference` como `type:id`. Se agrega:

```typescript
if (reservationType === 'quote') {
  const supabaseAdmin = createClient(...)

  // 1. Fetch quote
  const { data: quote } = await supabaseAdmin
    .from('quotes').select('*').eq('id', reservationId).single()
  if (!quote) return 404

  if (payment.status === 'approved') {
    // 2. Idempotencia: si ya existe contrato para este quote, saltar
    const { count } = await supabaseAdmin
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .eq('quote_id', reservationId)
    if (count > 0) return { success: true, skipped: true }

    // 3. Verificar conflicto de slot
    const { data: conflict } = await supabaseAdmin.rpc('fn_check_slot_conflict', {
      p_venue_id: quote.venue_id,
      p_fecha: quote.fecha_evento,
      p_hora_inicio: quote.hora_inicio,
      p_hora_fin: quote.hora_fin,
    })

    if (conflict) {
      // Slot tomado: marcar quote como vencida y loguear para admin
      await supabaseAdmin
        .from('quotes')
        .update({ estado: 'vencida', notas: `[CONFLICTO] Slot tomado al momento del pago. Payment MP: ${paymentId}` })
        .eq('id', reservationId)
      // TODO: notificar al admin (email/webhook futuro)
      return { success: false, reason: 'slot_conflict' }
    }

    // 4. Generar folio de contrato
    const year = new Date().getFullYear()
    const { count: contractCount } = await supabaseAdmin
      .from('contracts').select('*', { count: 'exact', head: true })
      .gte('created_at', `${year}-01-01`)
    const folio = `CT-${year}-${String((contractCount ?? 0) + 1).padStart(3, '0')}`

    // 5. Crear contrato
    const depositPaid = Math.round(payment.transaction_amount * 100)
    const { data: contract } = await supabaseAdmin
      .from('contracts')
      .insert({
        folio,
        venue_id:        quote.venue_id,
        client_id:       quote.client_id,
        quote_id:        quote.id,
        fecha_evento:    quote.fecha_evento,
        hora_inicio:     quote.hora_inicio,
        hora_fin:        quote.hora_fin,
        num_invitados:   quote.guest_count,
        salon_renta:     quote.subtotal,
        total:           quote.total,
        deposito_pagado: depositPaid / 100,
        estado:          'borrador',
        notas:           quote.notas,
      })
      .select().single()

    // 6. Registrar pago de anticipo
    if (contract) {
      await supabaseAdmin.from('contract_payments').insert({
        contract_id: contract.id,
        monto:       depositPaid / 100,
        fecha:       new Date().toISOString().split('T')[0],
        metodo:      'tarjeta',
        tipo:        'anticipo',
        notas:       `Pago online MP #${paymentId}`,
      })
    }

    // 7. Actualizar estado de quote
    await supabaseAdmin
      .from('quotes')
      .update({ estado: 'aprobada' })
      .eq('id', reservationId)
  }

  if (payment.status === 'rejected' || payment.status === 'cancelled') {
    // No cambiar estado de la quote — el cliente puede reintentar
    console.log(`Payment rejected for quote ${reservationId}`)
  }

  return { success: true }
}
```

---

## 5. Cambios en Angular

### 5.1 Interface `Quote` — agregar campos

Archivo: `src/app/core/interfaces/quote.ts`

```typescript
export interface Quote {
  // ... campos existentes ...
  time_slot_id:     string | null;   // NUEVO
  mp_preference_id: string | null;   // NUEVO
  snack_option_id:  string | null;   // NUEVO
  package_id:       string | null;   // NUEVO
}

export interface CreateQuoteData {
  // ... campos existentes ...
  time_slot_id?:     string;         // NUEVO
  snack_option_id?:  string;         // NUEVO
  package_id?:       string;         // NUEVO
}
```

### 5.2 `PaymentService` — agregar tipo `'quote'`

Archivo: `src/app/core/services/payment.service.ts`

```typescript
async createPayment(
  reservationId: string,
  reservationType: 'private' | 'playdate' | 'quote',  // agregar 'quote'
): Promise<PaymentPreference | null>
```

Internamente solo cambia el tipo que se envía en el body — ya el edge function `create-payment` distingue por `reservation_type`.

### 5.3 `QuoteService` — sin cambio de interfaz pública

`getByPublicToken(token)` ya existe. Solo asegurarse de que `create()` acepte los nuevos campos del interface.

### 5.4 Online Wizard — Cambio de flujo central

Archivo: `src/app/features/reservations/pages/private-reservation-page/private-reservation-page.ts`

**Cambio principal:** Reemplazar `createPrivateReservation()` por `QuoteService.create()`:

```typescript
// En submitReservation() (y en submitAdminLocalReservation()):
const quote = await this.quoteService.create({
  fecha:           today,
  fecha_evento:    this.selectedDate()!,
  hora_inicio:     slot.start_time,
  hora_fin:        slot.end_time,
  time_slot_id:    slot.id,
  guest_count:     this.guestCount(),
  snack_option_id: this.selectedSnack()?.id ?? null,
  package_id:      this.selectedPackage()!.id,
  subtotal:        packagePrice / 100,
  total:           totalCents / 100,
  deposit_amount:  depositCents / 100,
  estado:          'enviada',
  notas:           this.notes() ?? null,
  items:           this.buildQuoteItems(),  // package + snack + extras
});

if (quote) {
  this.router.navigate(['/cotizacion', quote.public_token]);
}
```

**`buildQuoteItems()`** convierte `selectedPackage`, `selectedSnack`, `selectedExtras` en `quote_items`:
- Item 1: Paquete "{nombre}" — precio
- Item 2 (si aplica): Merienda "{nombre}" — precio  
- Items 3+: Extras (los que no son `pay_at_venue`) — precio
- Items extras-en-local: marcados con nota "Cobro en local", precio 0 en quote

**Eliminar completamente:**
- `createPrivateReservation()` y sus llamadas
- `submitAdminLocalReservation()` (el admin ahora usa el wizard de admin-quotes)
- `generateQuoteOnly()` (ahora TODO es quote-first, no hay diferencia)
- `ReservationService` imports y llamadas relacionadas a private reservations

**Navegación de retorno desde MP:** Ya manejada por la nueva `PublicQuotePage`.

### 5.5 Nueva página: `PublicQuotePage`

**Ruta:** `/cotizacion/:token`  
**Módulo:** `src/app/features/quotes/pages/public-quote-page/`

```
public-quote-page/
  public-quote-page.ts
  public-quote-page.html
```

**Lógica del componente:**
```typescript
export class PublicQuotePage {
  readonly quote        = signal<Quote | null>(null);
  readonly loading      = signal(true);
  readonly notFound     = signal(false);
  readonly paymentStatus = signal<string | null>(null);
  readonly checkingSlot = signal(false);
  readonly paying       = signal(false);
  readonly slotConflict = signal<{ slot: string; availableDates: AltDate[] } | null>(null);

  constructor() {
    this.loadQuote();
  }

  private async loadQuote(): Promise<void> {
    const token = inject(ActivatedRoute).snapshot.paramMap.get('token');
    const status = inject(ActivatedRoute).snapshot.queryParamMap.get('status');
    if (status) this.paymentStatus.set(status);
    if (status === 'approved') this.launchConfetti();

    const quote = await this.quoteService.getByPublicToken(token!);
    if (!quote) { this.notFound.set(true); this.loading.set(false); return; }
    this.quote.set(quote);
    this.loading.set(false);
  }

  async payNow(): Promise<void> {
    const q = this.quote();
    if (!q || this.paying() || this.checkingSlot()) return;
    this.checkingSlot.set(true);

    // 1. Verificar conflicto de slot
    if (q.hora_inicio && q.fecha_evento) {
      const conflict = await this.contractService.checkSlotConflict(
        q.venue_id, q.fecha_evento, q.hora_inicio, q.hora_fin ?? undefined
      );
      if (conflict) {
        const altDates = await this.buildAltDates(q);
        this.slotConflict.set({ slot: q.hora_inicio, availableDates: altDates });
        this.checkingSlot.set(false);
        return;
      }
    }

    // 2. Redirigir a MP
    this.checkingSlot.set(false);
    this.paying.set(true);
    const pref = await this.paymentService.createPayment(q.id, 'quote');
    if (pref) this.paymentService.redirectToCheckout(pref);
    else { /* toast error */ this.paying.set(false); }
  }

  async rescheduleAndPay(alt: AltDate): Promise<void> {
    // Update quote fecha_evento + hora_inicio + hora_fin + time_slot_id
    // Then payNow()
  }
}
```

**Template — secciones:**
1. Banner de estado MP (`?status=approved|failure|pending`) — igual que reservation-detail-page actual
2. Resumen de evento (fecha, horario, invitados)
3. Lista de items (package + snack + extras)
4. Pricing summary (subtotal / total / anticipo / restante)
5. Rescue card de conflicto (mismo patrón que reservation-detail-page actual)
6. Botón "Pagar anticipo" — solo visible si `quote.estado !== 'aprobada'` y `!slotConflict()`
7. Si `quote.estado === 'aprobada'`: mensaje "Tu anticipo ya fue registrado ✓"
8. Botones: Descargar PDF (con QR apuntando a `/cotizacion/${quote.public_token}`), Compartir WhatsApp

**Acceso público (sin auth):** La página usa `QuoteService.getByPublicToken()` que hace query pública al `public_token`. Asegurar que RLS en `quotes` permita `SELECT` a anon cuando `public_token = :token` (ya existe `20260527000010_public_quotes_rls.sql`).

### 5.6 Admin Quotes — Ajuste menor

Archivo: `src/app/features/admin/pages/admin-quotes/admin-quotes.ts`

**Agregar en el wizard al crear/editar:** guardar `time_slot_id` cuando se selecciona el horario:

```typescript
// Donde ya se hace:
hora_inicio: this.selectedSlot()?.start_time,
hora_fin:    this.selectedSlot()?.end_time,

// Agregar:
time_slot_id: this.selectedSlot()?.id,
```

**Agregar botón "Copiar link" en la lista de cotizaciones:**
```html
<p-button icon="pi pi-link" severity="secondary" [outlined]="true"
          pTooltip="Copiar link del cliente"
          (onClick)="copyPublicLink(quote)" />
```

```typescript
copyPublicLink(quote: Quote): void {
  const url = `${window.location.origin}/cotizacion/${quote.public_token}`;
  navigator.clipboard.writeText(url);
  this.showToast('success', 'Link copiado');
}
```

**Template de impresión:** agregar URL y QR en el HTML generado:

En `buildPrintHtml()` (aproximadamente línea 870), agregar al final del documento:
```html
<div style="text-align:center; margin-top:24px; padding-top:16px; border-top:1px solid #e2e8f0;">
  <p style="font-size:11px; color:#64748b;">Accede o paga tu anticipo en línea:</p>
  <p style="font-size:12px; font-weight:600; color:#1e293b; word-break:break-all;">
    ${window.location.origin}/cotizacion/${quote.public_token}
  </p>
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(url)}" 
       width="120" height="120" alt="QR Code" style="margin-top:8px;" />
</div>
```

> **Nota:** En producción reemplazar el servicio QR por generación local con `qrcode` library para privacidad.

### 5.7 Router — Agregar ruta, eliminar ruta vieja

Archivo donde viven las rutas públicas (verificar en `app.routes.ts` o el archivo de rutas de `reservations`):

```typescript
// AGREGAR:
{
  path: 'cotizacion/:token',
  loadComponent: () =>
    import('./features/quotes/pages/public-quote-page/public-quote-page')
      .then(m => m.PublicQuotePage),
},

// ELIMINAR:
// { path: 'reserva/:accessToken', loadComponent: ... ReservationDetailPage }
```

### 5.8 Archivos a eliminar

- `src/app/features/reservations/pages/reservation-detail-page/reservation-detail-page.ts`
- `src/app/features/reservations/pages/reservation-detail-page/reservation-detail-page.html`
- Métodos en `ReservationService` relacionados a private reservations:
  - `getPrivateReservationByToken()`
  - `getPrivateReservationExtras()`
  - `getSnackOptionName()` (si no se usa en otro lugar)
  - `reschedulePrivateReservation()`
  - `createPrivateReservation()` y helpers relacionados
  - `isSlotBlockedByPrivate()` (ya no existe private_reservations)

---

## 6. Flujos Completos

### Scenario A — Cliente Online

1. Llena wizard en `/reserva-privada` (o landing) → `QuoteService.create()` con todos los datos
2. Navega a `/cotizacion/:public_token`
3. Ve resumen + botón "Pagar anticipo"
4. Click → check slot conflict → libre → redirect a MP
5. Paga en MP → webhook → crea contract + contract_payment
6. Regresa a `/cotizacion/:token?status=approved` → confetti + "Tu anticipo fue registrado"

### Scenario B — Admin crea y envía cotización

1. Admin en `/admin/cotizaciones` → wizard → `QuoteService.create()` 
2. Quote creada con `public_token` automático
3. Admin hace click "Copiar link" o imprime con QR
4. Cliente paga en línea → Scenario A desde paso 4
5. OR: cliente llega a recepción → admin hace "Registrar anticipo" → `submitAnticipo()` → contract directo

### Scenario C — Admin registra pago en efectivo

1. Cualquier quote existente (admin-generada o del wizard online)
2. Admin en `/admin/cotizaciones` → click "Registrar anticipo" → `submitAnticipo()`
3. `submitAnticipo()` verifica conflicto, crea contract, crea contract_payment (efectivo)
4. Admin navega al contrato recién creado

---

## 7. Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| MP webhook doble disparo | Verificar `EXISTS (SELECT 1 FROM contracts WHERE quote_id = X)` antes de INSERT |
| Slot tomado entre check y pago | Webhook verifica de nuevo; si hay conflicto, marca quote como `vencida` y loguea — admin resuelve |
| `submitAnticipo()` sin time_slot_id en quotes viejas | Usa `hora_inicio` directo para check; `time_slot_id` solo es nice-to-have para reschedule |
| RLS en quotes para anon | Ya existe `20260527000010_public_quotes_rls.sql`; verificar que cubra SELECT por `public_token` |
| QR externo en impresión | Aceptable para fase inicial; reemplazar con `qrcode` lib en iteración posterior |

---

## 8. Orden de Implementación

El orden garantiza que en cualquier punto intermedio el sistema sigue funcionando:

| Tarea | Qué cambia | Riesgo si falla |
|---|---|---|
| **T1** DB Migration | ALTER quotes + DROP private_reservations + UPDATE RPCs | Requiere datos de prueba vacíos — verificar antes |
| **T2** Edge Function `create-payment` | Agregar rama `quote` | Nulo — rama nueva, las existentes intactas |
| **T3** Edge Function `mp-webhook` | Agregar rama `quote` → crea contract | Nulo — rama nueva |
| **T4** Angular: Quote interface + PaymentService | Tipos + método `'quote'` | Compilación TypeScript |
| **T5** Angular: Nueva `PublicQuotePage` | Nuevo componente + ruta | Nulo — ruta nueva |
| **T6** Angular: Online wizard → Quote-first | Cambio de `createPrivateReservation` a `QuoteService.create` | Rompe flujo online; probar antes de merge |
| **T7** Angular: Admin quote — time_slot_id + copy link + QR | Mejoras admin | Bajo riesgo |
| **T8** Cleanup | Eliminar reservation-detail-page, limpiar ReservationService | Post-validación |

---

## 9. Global Constraints

- Angular 21 zoneless — sin `NgZone`, sin `ChangeDetectorRef`, sin `async ngOnInit`
- `standalone: true` NO se escribe (es default en v20+)
- `changeDetection: ChangeDetectionStrategy.OnPush` en todos los componentes
- Currency pipe: `| currency:'MXN':'symbol-narrow':'1.0-0'` (sin 4° parámetro locale)
- External template files `.html` siempre (nunca inline)
- `inject()` siempre (nunca constructor injection)
- `input()` y `output()` en lugar de `@Input`/`@Output`
- `@if`, `@for`, `@switch` (control flow nativo)
- Signals: `signal()`, `computed()`, `update()` / `set()` (nunca `mutate()`)
- No `ngClass` → usar `[class]`; no `ngStyle` → usar `[style]`
