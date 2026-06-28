# Plan de Implementación: Flujo Unificado Quote-First

**Spec:** `docs/superpowers/specs/2026-06-22-quote-first-unified-flow-design.md`  
**Proyecto:** `/home/eduardo/Proyectos/hula-hoop`  
**Supabase project ID:** `jzdfxbbnhkzdetrpmqdx`

---

## Global Constraints (copiar en cada tarea de implementación)

- Angular 21 zoneless — `provideZonelessChangeDetection()`. Sin `NgZone`, sin `ChangeDetectorRef.detectChanges()`, sin `async ngOnInit()`
- Patrón correcto para carga: `constructor()` llama `private async loadXxx()` que llama `this.signal.set(data)`
- `standalone: true` NO se escribe — es default en Angular v20+
- `changeDetection: ChangeDetectionStrategy.OnPush` en todos los componentes
- Currency pipe: `| currency:'MXN':'symbol-narrow':'1.0-0'` — sin 4° parámetro locale
- Templates siempre en archivos `.html` externos — nunca inline
- `inject()` siempre — nunca constructor injection
- `input()` y `output()` — nunca `@Input`/`@Output` decoradores
- `@if`, `@for`, `@switch` — nunca `*ngIf`, `*ngFor`
- Signals: `signal()`, `computed()`, `update()` / `set()` — nunca `mutate()`
- No `ngClass` → `[class]`; no `ngStyle` → `[style]`
- `@HostBinding` / `@HostListener` → usar `host: {}` en el decorador
- `NgOptimizedImage` para imágenes estáticas (NO para base64)

---

## Phase 0: Contexto ya recopilado (NO requiere subagentes)

### Archivos clave existentes

| Archivo | Ruta | Notas |
|---|---|---|
| Quote interface | `src/app/core/interfaces/quote.ts` | Ya tiene `public_token`, `hora_inicio`, `hora_fin`, `guest_count`, `deposit_amount`. Faltan: `time_slot_id`, `mp_preference_id`, `snack_option_id`, `package_id` |
| QuoteService | `src/app/core/services/quote.service.ts` | `getByPublicToken(token)` ya existe en línea 124 |
| PaymentService | `src/app/core/services/payment.service.ts` | `createPayment(id, 'private'\|'playdate')` — agregar `'quote'` |
| ContractService | `src/app/core/services/contract.service.ts` | `checkSlotConflict()` ya existe (línea 321), `getBookedDates()` (línea 344) |
| Admin quotes | `src/app/features/admin/pages/admin-quotes/admin-quotes.ts` | Guarda `hora_inicio`/`hora_fin` en línea 496 pero NO `time_slot_id`. `submitAnticipo()` en línea 679 |
| Online wizard | `src/app/features/reservations/pages/private-reservation-page/private-reservation-page.ts` | 850 líneas. Llama `createPrivateReservation()` |
| Reservation detail | `src/app/features/reservations/pages/reservation-detail-page/reservation-detail-page.ts` | ELIMINAR en T8 |
| ReservationService | `src/app/core/services/reservation.service.ts` | Métodos a eliminar: `createPrivateReservation`, `getPrivateReservationByToken`, `getPrivateReservationExtras`, `getSnackOptionName`, `reschedulePrivateReservation`, `isSlotBlockedByPrivate`, `getAllPrivateReservations`, `getPrivateReservationsByProfile`, `getPrivateReservationByQuoteId` |
| App routes | `src/app/app.routes.ts` | `reserva/:accessToken` en línea 43. Agregar `cotizacion/:token` junto a ella |
| Slot conflict migration | `supabase/migrations/20260622175119_slot_conflict_validation.sql` | `fn_check_slot_conflict` y `fn_get_booked_dates` — ambas tienen JOINs a `private_reservations` que hay que quitar |
| Trigger migration | `supabase/migrations/20260527000006_unified_booking_quotes_contracts.sql` | `fn_reservation_on_insert` |
| Trigger 2 migration | `supabase/migrations/20260527000007_fix_trigger_id_generation.sql` | `fn_reservation_confirmed_to_contract` |
| Public quotes RLS | `supabase/migrations/20260527000010_public_quotes_rls.sql` | Ya existe — verificar que cubre SELECT por `public_token` para anon |
| Edge function `create-payment` | Supabase (no en repo local) | Línea key: `external_reference: \`${reservation_type}:${reservation_id}\`` y `back_urls: \`/reserva/${reservation.access_token}\`` |
| Edge function `mp-webhook` | Supabase (no en repo local) | Parsea `externalRef.split(':')` — el tipo `'quote'` necesita rama nueva |

### Dependencias entre tareas

```
T1 (DB) → T2 (edge create-payment) → T3 (edge mp-webhook)
T1 (DB) → T4 (Angular interfaces)
T4 → T5 (PublicQuotePage)
T5 → T6 (Online wizard)
T4 → T7 (Admin mejoras)
T5 + T6 + T7 → T8 (Cleanup)
```

---

## Tarea 1: Migración de Base de Datos

**Tipo:** SQL Migration  
**Riesgo:** Medio — DROP tablas. Verificar que `private_reservations` y `private_reservation_extras` estén vacías o con solo datos de prueba antes de ejecutar.  
**Commit esperado:** 1 archivo SQL en `supabase/migrations/`

### Qué hacer

Crear archivo `supabase/migrations/20260622200001_quote_first_unified_flow.sql` con:

**1. Agregar columnas a `quotes`:**
```sql
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS time_slot_id     UUID REFERENCES time_slots(id),
  ADD COLUMN IF NOT EXISTS mp_preference_id TEXT,
  ADD COLUMN IF NOT EXISTS snack_option_id  UUID REFERENCES snack_options(id),
  ADD COLUMN IF NOT EXISTS package_id       UUID REFERENCES packages(id);
```

**2. Actualizar `fn_check_slot_conflict`** — quitar el bloque completo que hace JOIN a `private_reservations` (segunda sección del `IF v_count > 0 THEN RETURN TRUE; END IF;`). Solo debe quedar la verificación contra `contracts`.

Reemplazar la función entera con la versión simplificada:
```sql
CREATE OR REPLACE FUNCTION fn_check_slot_conflict(
  p_venue_id          UUID,
  p_fecha             DATE,
  p_hora_inicio       TEXT,
  p_hora_fin          TEXT     DEFAULT NULL,
  p_exclude_contract  UUID     DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM contracts
  WHERE venue_id     = p_venue_id
    AND fecha_evento = p_fecha
    AND hora_inicio::TEXT = p_hora_inicio
    AND estado NOT IN ('cancelado')
    AND (p_exclude_contract IS NULL OR id <> p_exclude_contract);
  RETURN v_count > 0;
END; $$;
GRANT EXECUTE ON FUNCTION fn_check_slot_conflict(UUID, DATE, TEXT, TEXT, UUID) TO anon, authenticated;
```

**3. Actualizar `fn_get_booked_dates`** — quitar el segundo `RETURN QUERY` que hace JOIN a `private_reservations`. Solo queda el de `contracts`.

**4. Eliminar triggers y funciones de reservaciones:**
```sql
DROP TRIGGER IF EXISTS trg_reservation_on_insert ON private_reservations;
DROP FUNCTION IF EXISTS fn_reservation_on_insert();
DROP TRIGGER IF EXISTS trg_reservation_confirmed ON private_reservations;
DROP FUNCTION IF EXISTS fn_reservation_confirmed_to_contract();
```

**5. Eliminar tablas de reservaciones privadas (en orden FK-safe):**
```sql
DROP TABLE IF EXISTS private_reservation_extras CASCADE;
DROP TABLE IF EXISTS private_reservations CASCADE;
```

**6. Verificar RLS de public_quotes** — leer `supabase/migrations/20260527000010_public_quotes_rls.sql`. Si ya tiene `USING (true)` para SELECT con `public_token`, no agregar nada. Si no cubre SELECT para `anon`, agregar:
```sql
CREATE POLICY "Anon can view quotes by public_token"
  ON quotes FOR SELECT TO anon
  USING (public_token IS NOT NULL);
```

### Aplicar la migración

Usar Supabase MCP: `mcp__claude_ai_Supabase__apply_migration` con el SQL completo.

### Verificación
- `SELECT column_name FROM information_schema.columns WHERE table_name = 'quotes' AND column_name IN ('time_slot_id', 'mp_preference_id', 'snack_option_id', 'package_id')` — debe retornar 4 filas
- `SELECT COUNT(*) FROM private_reservations` — debe fallar con "relation does not exist"
- Ejecutar `SELECT fn_check_slot_conflict('00000000-0000-0000-0000-000000000000'::UUID, CURRENT_DATE, '10:00')` — debe retornar `false` sin error

---

## Tarea 2: Edge Function `create-payment` — Agregar tipo `quote`

**Tipo:** Supabase Edge Function (TypeScript/Deno)  
**Riesgo:** Bajo — rama nueva, código existente intacto  
**Commit esperado:** Re-deploy de la función vía MCP

### Contexto

La función actual (recuperada via `mcp__claude_ai_Supabase__get_edge_function` project `jzdfxbbnhkzdetrpmqdx` slug `create-payment`) lee `reservation_type` del body y hace switch entre `private_reservations` y `playdate_reservations`. 

**Insertar rama nueva ANTES del bloque `const items = []`:**

```typescript
// ─── RAMA NUEVA: tipo 'quote' ─────────────────────────────────────────────
if (reservation_type === 'quote') {
  const { data: quote, error: quoteErr } = await supabaseAdmin
    .from('quotes')
    .select('*, client:clients(nombre, email)')
    .eq('id', reservation_id)
    .single()

  if (quoteErr || !quote) {
    return new Response(
      JSON.stringify({ error: 'Cotización no encontrada' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (quote.estado === 'aprobada') {
    return new Response(
      JSON.stringify({ error: 'Esta cotización ya fue pagada' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const chargeCents = Math.round((quote.deposit_amount ?? quote.total) * 100)
  const clientName  = (quote.client as any)?.nombre ?? 'Cliente'
  const clientEmail = (quote.client as any)?.email  ?? ''

  const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mpAccessToken}`,
    },
    body: JSON.stringify({
      items: [{
        title: 'Anticipo – Fiesta Privada',
        quantity: 1,
        unit_price: chargeCents / 100,
        currency_id: 'MXN',
      }],
      payer: { name: clientName, email: clientEmail },
      back_urls: {
        success: `${appUrl}/cotizacion/${quote.public_token}?status=approved`,
        failure: `${appUrl}/cotizacion/${quote.public_token}?status=failure`,
        pending: `${appUrl}/cotizacion/${quote.public_token}?status=pending`,
      },
      auto_return: 'approved',
      external_reference: `quote:${reservation_id}`,
      notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`,
      statement_descriptor: 'HULA HOOP',
    }),
  })

  if (!mpResp.ok) {
    const mpError = await mpResp.text()
    console.error('MP error (quote):', mpError)
    return new Response(
      JSON.stringify({ error: 'Error al crear preferencia de pago' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const mpData = await mpResp.json()

  await supabaseAdmin
    .from('quotes')
    .update({ mp_preference_id: mpData.id })
    .eq('id', reservation_id)

  return new Response(
    JSON.stringify({
      init_point:         mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
      preference_id:      mpData.id,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
// ─── FIN RAMA QUOTE ───────────────────────────────────────────────────────
```

Insertar este bloque justo después de:
```typescript
if (!mpAccessToken) { ... }  // la validación del token
```
Y justo antes de:
```typescript
const items = []
```

### Deploy

Usar `mcp__claude_ai_Supabase__deploy_edge_function` con el código completo actualizado.

### Verificación
- La función original `private` y `playdate` deben seguir funcionando (no se tocan)
- El nuevo bloque `quote` retorna `{ init_point, sandbox_init_point, preference_id }`

---

## Tarea 3: Edge Function `mp-webhook` — Agregar rama `quote` → crea contrato

**Tipo:** Supabase Edge Function (TypeScript/Deno)  
**Riesgo:** Medio — toca el corazón de la confirmación de pagos. Idempotencia crítica.  
**Commit esperado:** Re-deploy de la función vía MCP

### Contexto

La función actual parsea `external_reference` como `type:id` y hace switch entre `private_reservations` y `playdate_reservations`. El flujo nuevo agrega la rama `quote`.

**Insertar rama nueva DESPUÉS del parse de `external_reference` y ANTES del switch de tabla:**

Actualmente el código hace:
```typescript
const [reservationType, reservationId] = externalRef.split(':')
const table = reservationType === 'private'
  ? 'private_reservations'
  : 'playdate_reservations'
```

Insertar inmediatamente después del `split(':')`:

```typescript
// ─── RAMA NUEVA: tipo 'quote' ─────────────────────────────────────────────
if (reservationType === 'quote') {
  const supabaseAdminQ = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data: quote } = await supabaseAdminQ
    .from('quotes')
    .select('*')
    .eq('id', reservationId)
    .single()

  if (!quote) {
    console.error('Quote not found:', reservationId)
    return new Response(JSON.stringify({ error: 'Quote not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (payment.status === 'approved') {
    // Idempotencia: no crear contrato si ya existe para esta quote
    const { count: existingCount } = await supabaseAdminQ
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .eq('quote_id', reservationId)

    if ((existingCount ?? 0) > 0) {
      console.log(`Contract already exists for quote ${reservationId}, skipping`)
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verificar conflicto de slot
    const { data: conflict } = await supabaseAdminQ.rpc('fn_check_slot_conflict', {
      p_venue_id:    quote.venue_id,
      p_fecha:       quote.fecha_evento,
      p_hora_inicio: quote.hora_inicio,
      p_hora_fin:    quote.hora_fin ?? null,
    })

    if (conflict) {
      await supabaseAdminQ
        .from('quotes')
        .update({
          estado: 'vencida',
          notas: `[CONFLICTO DE SLOT] Slot tomado al momento del pago online. MP Payment ID: ${paymentId}. Revisar con admin.`,
        })
        .eq('id', reservationId)
      console.error(`Slot conflict for quote ${reservationId} at payment time`)
      return new Response(JSON.stringify({ success: false, reason: 'slot_conflict' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generar folio de contrato
    const year = new Date().getFullYear()
    const { count: contractCount } = await supabaseAdminQ
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${year}-01-01`)
    const folio = `CT-${year}-${String((contractCount ?? 0) + 1).padStart(3, '0')}`

    const depositPaid = Math.round(payment.transaction_amount * 100)

    // Crear contrato
    const { data: contract, error: contractErr } = await supabaseAdminQ
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
        notas:           quote.notas ?? null,
      })
      .select()
      .single()

    if (contractErr || !contract) {
      console.error('Error creating contract from quote:', contractErr)
      return new Response(JSON.stringify({ error: 'Failed to create contract' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Registrar pago de anticipo
    await supabaseAdminQ.from('contract_payments').insert({
      contract_id: contract.id,
      monto:       depositPaid / 100,
      fecha:       new Date().toISOString().split('T')[0],
      metodo:      'tarjeta',
      tipo:        'anticipo',
      notas:       `Pago online MercadoPago #${paymentId}`,
    })

    // Marcar quote como aprobada
    await supabaseAdminQ
      .from('quotes')
      .update({ estado: 'aprobada' })
      .eq('id', reservationId)

    console.log(`Contract ${contract.id} (${folio}) created from quote ${reservationId}`)
  } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
    // No cambiar estado — el cliente puede reintentar
    console.log(`Payment ${payment.status} for quote ${reservationId}, no state change`)
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
// ─── FIN RAMA QUOTE ───────────────────────────────────────────────────────
```

### Deploy

Usar `mcp__claude_ai_Supabase__deploy_edge_function`.

### Verificación
- El código existente de `private_reservations` y `playdate_reservations` permanece intacto
- La rama `quote` retorna 200 en todos los casos (evita reintentos de MP)

---

## Tarea 4: Angular — Quote interface + PaymentService

**Tipo:** TypeScript (2 archivos)  
**Riesgo:** Bajo — solo agregar campos opcionales y un tipo  
**Commit esperado:** 1 commit con 2 archivos modificados

### 4a. `src/app/core/interfaces/quote.ts`

Agregar en la interface `Quote` (después de `deposit_amount`):
```typescript
time_slot_id:     string | null;
mp_preference_id: string | null;
snack_option_id:  string | null;
package_id:       string | null;
```

Agregar en `CreateQuoteData` (después de `deposit_amount?`):
```typescript
time_slot_id?:    string;
snack_option_id?: string;
package_id?:      string;
```

### 4b. `src/app/core/services/payment.service.ts`

Cambiar la firma de `createPayment`:
```typescript
// ANTES:
reservationType: 'private' | 'playdate',

// DESPUÉS:
reservationType: 'private' | 'playdate' | 'quote',
```

El body del método no cambia — ya pasa `reservation_type` como string al edge function.

### Verificación
- `npx tsc --noEmit` debe pasar sin errores
- Grep: `grep -n "reservationType" src/app/core/services/payment.service.ts` debe mostrar `'private' | 'playdate' | 'quote'`

---

## Tarea 5: Angular — Nueva `PublicQuotePage`

**Tipo:** Angular Component (nuevo)  
**Riesgo:** Bajo — componente nuevo en ruta nueva  
**Commit esperado:** 3-4 archivos nuevos + modificación de `app.routes.ts`

### Estructura de archivos

```
src/app/features/quotes/
  pages/
    public-quote-page/
      public-quote-page.ts
      public-quote-page.html
```

### `public-quote-page.ts` — esqueleto completo

```typescript
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { QuoteService } from '../../../../core/services/quote.service';
import { PaymentService } from '../../../../core/services/payment.service';
import { ContractService } from '../../../../core/services/contract.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import type { Quote } from '../../../../core/interfaces/quote';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

interface AltDate {
  date:   string;
  label:  string;
  slotId: string;
  slot:   Pick<TimeSlot, 'start_time' | 'end_time'>;
}

@Component({
  selector: 'app-public-quote-page',
  templateUrl: './public-quote-page.html',
  imports: [ButtonModule, TagModule, ToastModule, CurrencyMxnPipe],
  providers: [MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicQuotePage {
  private readonly route           = inject(ActivatedRoute);
  private readonly router          = inject(Router);
  private readonly quoteService    = inject(QuoteService);
  private readonly paymentService  = inject(PaymentService);
  private readonly contractService = inject(ContractService);
  private readonly timeSlotService = inject(TimeSlotService);
  private readonly messageService  = inject(MessageService);
  private readonly platformId      = inject(PLATFORM_ID);

  readonly loading       = signal(true);
  readonly notFound      = signal(false);
  readonly quote         = signal<Quote | null>(null);
  readonly paymentStatus = signal<string | null>(null);
  readonly checkingSlot  = signal(false);
  readonly paying        = signal(false);
  readonly rescheduling  = signal(false);
  readonly slotConflict  = signal<{
    slot:           string;
    availableDates: AltDate[];
  } | null>(null);

  readonly isPaid = computed(() => this.quote()?.estado === 'aprobada');

  readonly quoteItems = computed(() => this.quote()?.items ?? []);

  constructor() {
    this.loadQuote();
  }

  private async loadQuote(): Promise<void> {
    const token  = this.route.snapshot.paramMap.get('token');
    const status = this.route.snapshot.queryParamMap.get('status');
    if (status) this.paymentStatus.set(status);
    if (status === 'approved') void this.launchConfetti();

    if (!token) { this.notFound.set(true); this.loading.set(false); return; }

    const quote = await this.quoteService.getByPublicToken(token);
    if (!quote) { this.notFound.set(true); this.loading.set(false); return; }
    this.quote.set(quote);
    this.loading.set(false);
  }

  async payNow(): Promise<void> {
    const q = this.quote();
    if (!q || this.paying() || this.checkingSlot() || this.isPaid()) return;
    this.checkingSlot.set(true);

    if (q.hora_inicio && q.fecha_evento) {
      const conflict = await this.contractService.checkSlotConflict(
        q.venue_id, q.fecha_evento, q.hora_inicio, q.hora_fin ?? undefined,
      );
      if (conflict) {
        const slots = await this.timeSlotService.getActiveSlotsByVenue(q.venue_id);
        const currentSlot = slots.find(s => s.start_time === q.hora_inicio) ?? null;
        const altDates = currentSlot
          ? await this.buildAltDates(q.venue_id, currentSlot, slots)
          : [];
        this.slotConflict.set({
          slot: `${q.hora_inicio}${q.hora_fin ? ' – ' + q.hora_fin : ''}`,
          availableDates: altDates,
        });
        this.checkingSlot.set(false);
        return;
      }
    }

    this.checkingSlot.set(false);
    this.paying.set(true);
    const pref = await this.paymentService.createPayment(q.id, 'quote');
    if (pref) {
      this.paymentService.redirectToCheckout(pref);
    } else {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo iniciar el pago.' });
      this.paying.set(false);
    }
  }

  async rescheduleAndPay(alt: AltDate): Promise<void> {
    const q = this.quote();
    if (!q || this.rescheduling()) return;
    this.rescheduling.set(true);

    // Update quote with new date/slot data
    const updated = await this.quoteService.update(q.id, {
      fecha_evento: alt.date,
      hora_inicio:  alt.slot.start_time,
      hora_fin:     alt.slot.end_time,
      time_slot_id: alt.slotId,
    });

    if (!updated) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo reprogramar.' });
      this.rescheduling.set(false);
      return;
    }

    this.quote.set(updated);
    this.slotConflict.set(null);
    this.rescheduling.set(false);
    await this.payNow();
  }

  private async buildAltDates(venueId: string, currentSlot: TimeSlot, allSlots: TimeSlot[]): Promise<AltDate[]> {
    const today  = new Date();
    const toDate = new Date(today.getTime() + 90 * 86400000);
    const from   = today.toISOString().split('T')[0];
    const to     = toDate.toISOString().split('T')[0];

    const booked    = await this.contractService.getBookedDates(venueId, from, to, currentSlot.start_time);
    const bookedSet = new Set(booked.map(b => b.fecha));
    const results: AltDate[] = [];
    const cursor = new Date(today.getTime() + 86400000);

    while (results.length < 6 && cursor <= toDate) {
      const iso     = cursor.toISOString().split('T')[0];
      const dow     = cursor.getDay();
      const dayType: 'weekday' | 'weekend' = (dow === 0 || dow === 6) ? 'weekend' : 'weekday';
      const match   = allSlots.find(s => s.start_time === currentSlot.start_time && s.day_type === dayType)
                   ?? (currentSlot.day_type === dayType ? currentSlot : undefined);
      if (match && !bookedSet.has(iso)) {
        results.push({
          date:   iso,
          label:  cursor.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }),
          slotId: match.id,
          slot:   { start_time: match.start_time, end_time: match.end_time },
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return results;
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  private async launchConfetti(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const confetti = (await import('canvas-confetti')).default;
    confetti({ particleCount: 80, spread: 70, origin: { x: 0.15, y: 0.6 } });
    confetti({ particleCount: 80, spread: 70, origin: { x: 0.85, y: 0.6 } });
    setTimeout(() => confetti({ particleCount: 50, spread: 100, origin: { x: 0.5, y: 0.4 } }), 300);
  }
}
```

### `public-quote-page.html` — estructura

Reutilizar **exactamente** el patrón visual de `reservation-detail-page.html` ya existente (mismas clases Tailwind, mismos patrones de `@if`/`@for`). Secciones:

1. `<p-toast />`
2. Spinner de carga (`@if (loading())`)
3. Not found (`@else if (notFound())`)
4. Contenido principal (`@else if (quote(); as q)`)
   - Banner MP status: approved (verde con confetti) / failure (rojo) / pending (ámbar)
   - Header: "Cotización {{ q.folio }}" + badge de estado
   - Card resumen: fecha, horario, invitados
   - Card items: `@for (item of quoteItems(); track item.id)` — descripcion, cantidad, precio
   - Card pricing: subtotal, total, anticipo, restante
   - Rescue card de conflicto (mismo patrón que reservation-detail-page.html:228-268)
   - Botón "Pagar anticipo" — `@if (!isPaid() && !slotConflict())` con loading state
   - Si `isPaid()`: card verde "Tu anticipo ha sido registrado ✓"
   - Botones: "Descargar PDF" / "Compartir por WhatsApp" / "Ir al inicio"

### Agregar ruta en `app.routes.ts`

Justo después de la ruta `reserva/:accessToken` (línea 43), agregar:
```typescript
{
  path: 'cotizacion/:token',
  loadComponent: () =>
    import('./features/quotes/pages/public-quote-page/public-quote-page')
      .then(m => m.PublicQuotePage),
},
```

### Verificación
- `npx tsc --noEmit` sin errores
- Navegar a `/cotizacion/TOKEN_INVALIDO` → debe mostrar "Cotización no encontrada"
- Con un `public_token` válido de la DB debe cargar el resumen de la quote

---

## Tarea 6: Angular — Online Wizard → Quote-First

**Tipo:** TypeScript + refactor mayor (1 archivo de 850 líneas)  
**Riesgo:** Alto — este es el cambio de flujo principal. Probar antes de merge.  
**Commit esperado:** 1 commit (solo `private-reservation-page.ts`)

### Archivo: `src/app/features/reservations/pages/private-reservation-page/private-reservation-page.ts`

**LEER COMPLETO** antes de modificar.

**Objetivo:** Reemplazar `createPrivateReservation()` + navegación a `/reserva/` por `QuoteService.create()` + navegación a `/cotizacion/`.

**Cambios quirúrgicos:**

**1. Agregar imports:**
```typescript
import { QuoteService } from '../../../../core/services/quote.service';
import { SnackOptionService } from '../../../../core/services/snack-option.service'; // si no existe ya
```

**2. Inyectar `QuoteService`:**
```typescript
private readonly quoteService = inject(QuoteService);
```

**3. Reemplazar el método `submitReservation()` (o equivalente final del wizard):**

El método debe:
- Recopilar todos los datos del wizard (fecha, slot, package, guest_count, snack, extras, total, deposit)
- Llamar `QuoteService.create()` con el payload completo
- Navegar a `/cotizacion/${quote.public_token}`

```typescript
// Reemplazar la llamada a createPrivateReservation() con:
const packageItem = this.selectedPackage();
const slot        = this.selectedSlot();
const extras      = this.buildExtrasItems(); // ver abajo

const quote = await this.quoteService.create({
  fecha:           new Date().toISOString().split('T')[0],
  fecha_evento:    this.selectedDate()!,
  hora_inicio:     slot?.start_time,
  hora_fin:        slot?.end_time,
  time_slot_id:    slot?.id,
  guest_count:     this.guestCount(),
  snack_option_id: this.selectedSnack()?.id ?? undefined,
  package_id:      packageItem?.id,
  subtotal:        this.packagePriceCents() / 100,
  descuento:       0,
  total:           this.totalCents() / 100,
  deposit_amount:  this.depositCents() / 100,
  estado:          'enviada',
  notas:           this.notes()?.trim() || undefined,
  items:           this.buildQuoteItems(),
});

if (quote) {
  this.router.navigate(['/cotizacion', quote.public_token]);
} else {
  this.showError('No se pudo crear la cotización. Intenta de nuevo.');
  this.submitting.set(false);
}
```

**4. `buildQuoteItems()`** — nuevo método privado:

```typescript
private buildQuoteItems(): import('../../../../core/interfaces/quote').CreateQuoteData['items'] {
  const items: { descripcion: string; cantidad: number; precio_unitario: number }[] = [];
  const pkg = this.selectedPackage();
  if (pkg) items.push({ descripcion: pkg.name, cantidad: 1, precio_unitario: this.packagePriceCents() / 100 });

  const snack = this.selectedSnack();
  if (snack && snack.price_cents > 0) {
    items.push({ descripcion: `Merienda: ${snack.name}`, cantidad: 1, precio_unitario: snack.price_cents / 100 });
  }

  for (const [extraId, qty] of this.extraQty()) {
    const extra = this.availableExtras().find(e => e.id === extraId);
    if (extra && qty > 0) {
      items.push({
        descripcion:     extra.pay_at_venue ? `${extra.name} (cobro en local)` : extra.name,
        cantidad:        qty,
        precio_unitario: extra.pay_at_venue ? 0 : extra.price_cents / 100,
      });
    }
  }
  return items;
}
```

**5. Eliminar métodos que ya no se usan:**
- `createPrivateReservation()` — eliminar
- `submitAdminLocalReservation()` — eliminar (el admin usa su propio wizard)
- `generateQuoteOnly()` — eliminar (ahora todo es quote-first)
- Imports de `ReservationService` si ya no se usan otros métodos

**IMPORTANTE:** Verificar si `ReservationService` se usa para algo más en este componente (playdate, extras query, snack query) antes de eliminar el import.

**6. El slot conflict check en `onDateSelect()`:**

El wizard aún debe bloquear slots ya tomados por contratos. Verificar que llama a `contractService.checkSlotConflict()` (no a `isSlotBlockedByPrivate()`). Si solo llama a `reservationService.isSlotBlockedByPrivate()`, cambiar:
```typescript
// ELIMINAR: const blocked = await this.reservationService.isSlotBlockedByPrivate(...)
// REEMPLAZAR por (si no existe ya):
const blocked = await this.contractService.checkSlotConflict(venueId, date, slot.start_time, slot.end_time);
```

### Verificación
- `npx tsc --noEmit` sin errores
- Flujo manual: llenar el wizard online → al finalizar navega a `/cotizacion/:token`
- La quote aparece en el admin `/admin/cotizaciones` con todos los datos (fecha, hora, invitados, extras)
- El botón "Pagar anticipo" en `/cotizacion/:token` funciona → redirige a MP

---

## Tarea 7: Angular — Admin Quotes — `time_slot_id` + Copy Link + QR

**Tipo:** TypeScript + HTML (2 archivos existentes)  
**Riesgo:** Bajo  
**Commit esperado:** 1 commit

### Archivo: `src/app/features/admin/pages/admin-quotes/admin-quotes.ts`

**1. Agregar `time_slot_id` en el payload de creación/edición** (línea ~496):

```typescript
const payload = {
  // ... campos existentes ...
  hora_inicio:    this.selectedSlot()?.start_time,
  hora_fin:       this.selectedSlot()?.end_time,
  time_slot_id:   this.selectedSlot()?.id,   // AGREGAR
  // ...
};
```

**2. Agregar método `copyPublicLink(quote)`:**

```typescript
copyPublicLink(quote: Quote): void {
  if (!isPlatformBrowser(this.platformId)) return;
  const url = `${window.location.origin}/cotizacion/${quote.public_token}`;
  navigator.clipboard.writeText(url).then(() => {
    this.showToast('success', 'Link copiado al portapapeles');
  });
}
```

Si `PLATFORM_ID` no está inyectado en este componente, agregarlo:
```typescript
private readonly platformId = inject(PLATFORM_ID);
```
Y el import: `import { isPlatformBrowser } from '@angular/common';`

**3. En el template de impresión `buildPrintHtml()` (buscar la función que genera el HTML del ticket),** agregar al final del documento HTML antes del `</body>`:

```typescript
const cotizacionUrl = `${window.location.origin}/cotizacion/${quote.public_token}`;
const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(cotizacionUrl)}`;

// Agregar en el HTML string:
`<div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
  <p style="font-size:11px;color:#64748b;margin:0 0 4px;">Accede o paga tu anticipo en línea:</p>
  <p style="font-size:12px;font-weight:600;color:#1e293b;word-break:break-all;margin:0 0 8px;">${cotizacionUrl}</p>
  <img src="${qrUrl}" width="120" height="120" alt="QR" style="display:block;margin:0 auto;" />
</div>`
```

### Archivo: `src/app/features/admin/pages/admin-quotes/admin-quotes.html`

Agregar botón "Copiar link" junto a los botones de acción de cada quote en la lista (buscar la zona de botones de acciones por quote):

```html
<p-button icon="pi pi-link"
          severity="secondary"
          [outlined]="true"
          pTooltip="Copiar link del cliente"
          (onClick)="copyPublicLink(quote)" />
```

### Verificación
- Al crear una quote desde el admin, el campo `time_slot_id` aparece en la DB
- Botón "Copiar link" copia la URL correcta al portapapeles
- Al imprimir/previsualizar la cotización, aparece URL + QR al final

---

## Tarea 8: Cleanup — Eliminar código obsoleto

**Tipo:** Eliminación de archivos y limpieza de servicios  
**Riesgo:** Bajo — solo código que ya no se usa  
**Commit esperado:** 1 commit

### 8.1 Eliminar `ReservationDetailPage`

Eliminar archivos:
- `src/app/features/reservations/pages/reservation-detail-page/reservation-detail-page.ts`
- `src/app/features/reservations/pages/reservation-detail-page/reservation-detail-page.html`

En `app.routes.ts`: eliminar la ruta `reserva/:accessToken` y su `loadComponent`.

### 8.2 Limpiar `ReservationService`

Archivo: `src/app/core/services/reservation.service.ts`

Verificar cuáles métodos siguen siendo usados (por playdate, etc.) con:
```bash
grep -rn "reservationService\." src/app --include="*.ts" | grep -v "spec.ts"
```

Eliminar los métodos relacionados a `private_reservations` que ya no tengan referencias:
- `getPrivateReservationByToken()`
- `getPrivateReservationByQuoteId()`
- `createPrivateReservation()`
- `getPrivateReservationExtras()`
- `getSnackOptionName()` — si solo se usaba en reservation-detail-page
- `reschedulePrivateReservation()`
- `isSlotBlockedByPrivate()`
- `getAllPrivateReservations()`
- `getPrivateReservationsByProfile()`

Eliminar también los interfaces `PrivateReservation`, `CreatePrivateReservationData` de `src/app/core/interfaces/reservation.ts` si ya no se referencian en ningún lado.

### 8.3 Verificar admin-reservas

Si existe `/admin/reservas` que listaba `private_reservations`, verificar si sigue compilando. Si referencia `getAllPrivateReservations()`, o bien:
- Adaptarlo para mostrar quotes en estado `enviada`/`borrador`
- O eliminarlo si ya no tiene propósito

Buscar: `grep -rn "getAllPrivateReservations\|getPrivateReservations\|private_reservations" src/app --include="*.ts"`

### Verificación final
- `npx tsc --noEmit` sin errores
- `npm run build` completa sin errores
- Navegar a `/reserva/cualquier-token` → 404 o redirect
- Navegar a `/cotizacion/token-valido` → carga la quote correctamente
- Flujo completo: wizard online → cotización → pagar → webhook → contrato en admin

---

## Ledger de Progreso

Actualizar cuando cada tarea se complete:

```
T1 DB Migration:    [ ] pending
T2 create-payment:  [ ] pending
T3 mp-webhook:      [ ] pending
T4 Interfaces+Pay:  [ ] pending
T5 PublicQuotePage: [ ] pending
T6 OnlineWizard:    [ ] pending
T7 AdminQuotes:     [ ] pending
T8 Cleanup:         [ ] pending
```
