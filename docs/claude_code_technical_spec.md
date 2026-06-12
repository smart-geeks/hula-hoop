# Especificación Técnica de Implementación: Integración de Reservas, Eventos y POS

Este documento es el plano de desarrollo para Claude Code. Implementa cada fase de forma atómica, verificando `tsc --noEmit` y `ng build` antes de cada commit. Mantén el patrón **Zoneless** en todo momento.

---

## Contexto de Archivos Clave

| Archivo | Relevancia |
|---------|-----------|
| `src/app/features/quotes/pages/quote-public-page/quote-public-page.ts` | P0 bug Zoneless |
| `src/app/features/reservations/pages/private-reservation-page/private-reservation-page.ts` | Wizard de reserva (recibe quote_id) |
| `src/app/features/admin/pages/admin-event-detail/` | Event Hub YA EXISTE — 309 TS + 681 HTML |
| `src/app/core/services/quote.service.ts` | Método `getByPublicToken` y `getVenueByQuote` |
| `src/app/core/services/venue.service.ts` | `getById()` para resolver venue_slug |
| `supabase/migrations/20260520000001_platform_schema.sql` | Tablas quotes, contracts, event_profit_loss view |
| `supabase/migrations/20260523000001_cashier_system.sql` | pos_sessions, pos_sales, pos_sale_items |

---

## Fase 1: Correcciones P0 — Cotización Pública y Bridge Quote→Reserva

### 1.1 Refactor Zoneless de `quote-public-page.ts`

El componente viola el patrón Zoneless con `async ngOnInit()`. Migrar a constructor:

```typescript
// ANTES (incorrecto):
export class QuotePublicPage implements OnInit {
  async ngOnInit(): Promise<void> { ... }
}

// DESPUÉS (correcto):
export class QuotePublicPage {
  constructor() {
    const token = this.route.snapshot.paramMap.get('token');
    if (token) {
      this.loadQuote(token);
    } else {
      this.notFound.set(true);
      this.loading.set(false);
    }
  }

  private async loadQuote(token: string): Promise<void> {
    const q = await this.quoteService.getByPublicToken(token);
    if (!q) {
      this.notFound.set(true);
    } else {
      this.quote.set(q);
    }
    this.loading.set(false);
  }
}
```

Quitar `OnInit` del import y de `implements`.

### 1.2 Botón "Aprobar y Pagar Anticipo" en `quote-public-page.html`

Agregar el botón **solo** cuando `q.estado !== 'aprobada' && q.estado !== 'vencida'` y la cotización tiene `fecha_evento`. El botón navega al wizard de reserva con el `venue_slug` correcto.

**Resolución de venue_slug**: La cotización tiene `venue_id`. Necesitamos el `slug` para construir la ruta. Agregar al componente TS:

```typescript
// En quote-public-page.ts
import { Router } from '@angular/router';
import { VenueService } from '../../../../core/services/venue.service';

private readonly router     = inject(Router);
private readonly venueService = inject(VenueService);

readonly venueSlug = signal<string | null>(null);

// En loadQuote(), después de this.quote.set(q):
const venue = await this.venueService.getVenueById(q.venue_id);
this.venueSlug.set(venue?.slug ?? null);

// Método de navegación:
approveAndPay(): void {
  const q = this.quote();
  const slug = this.venueSlug();
  if (!q || !slug) return;
  this.router.navigate(['/', slug, 'reservar', 'fiesta-privada'], {
    queryParams: { quote_id: q.id }
  });
}
```

Verificar que `VenueService` tenga un método `getVenueById(id: string)`. Si no existe, agregarlo:

```typescript
async getVenueById(id: string): Promise<{ id: string; slug: string; nombre: string } | null> {
  const client = this.supabase.client;
  if (!client) return null;
  const { data } = await client.from('venues').select('id, slug, nombre').eq('id', id).single();
  return data ?? null;
}
```

**HTML del botón** (dentro del bloque `@else if (quote(); as q)`, reemplazar la sección `<!-- Actions -->`):

```html
<!-- Actions -->
<div class="flex flex-col sm:flex-row gap-3 justify-center">
  @if (q.estado !== 'aprobada' && q.estado !== 'vencida' && q.fecha_evento && venueSlug()) {
    <button (click)="approveAndPay()"
      class="flex items-center justify-center gap-2 px-6 py-3 bg-rojo-brillante text-white rounded-xl text-sm font-semibold hover:bg-rojo-brillante/90 transition-colors shadow-md">
      <i class="pi pi-credit-card text-sm"></i>
      Aprobar y Pagar Anticipo
    </button>
  }
  <button (click)="printPdf()"
    class="flex items-center justify-center gap-2 px-6 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
    <i class="pi pi-print text-sm"></i>
    Imprimir / Guardar PDF
  </button>
  <a routerLink="/"
    class="flex items-center justify-center gap-2 px-6 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
    <i class="pi pi-home text-sm"></i>
    Visitar nuestro sitio
  </a>
</div>
```

### 1.3 Recepción de `quote_id` en `private-reservation-page.ts`

El wizard de reserva debe leer el queryParam `quote_id` al cargar y pasarlo al crear la reserva, completando el Bridge & Unify.

```typescript
// En private-reservation-page.ts — agregar en el constructor (o en loadInitialData):
import { ActivatedRoute } from '@angular/router';

private readonly route = inject(ActivatedRoute);
readonly linkedQuoteId = signal<string | null>(null);

// En el constructor, después de cargar datos del venue:
const quoteId = this.route.snapshot.queryParamMap.get('quote_id');
this.linkedQuoteId.set(quoteId);
```

En el método `createPrivateReservation` (o donde se construya el payload de inserción), agregar:

```typescript
// Al construir reservationData:
const payload: CreatePrivateReservationData = {
  ...otrosCampos,
  quote_id: this.linkedQuoteId() ?? undefined,
};
```

Verificar que `CreatePrivateReservationData` permita `quote_id?: string | null` en la interfaz `reservation.ts`.

---

## Fase 2: Mejoras al Event Hub Existente (`admin-event-detail`)

> **IMPORTANTE:** El componente `admin-event-detail` YA EXISTE con 5 pestañas funcionales (resumen, pagos, cotizacion, tareas, gastos). NO recrear desde cero. Agregar las siguientes mejoras:

### 2.1 Barra de Progreso Visual de Estado del Contrato

Agregar un stepper visual (HTML/Tailwind, no PrimeNG) que muestre el progreso del contrato según su `estado`. Los 5 pasos y sus estados de contrato correspondientes:

| Paso | Label | Estado del contrato |
|------|-------|-------------------|
| 1 | Cotización | `borrador` / `pendiente` (del quote) |
| 2 | Reservado | `reservado` |
| 3 | Operación | `activo` |
| 4 | Día del Evento | `en_progreso` |
| 5 | Concluido | `concluido` / `cancelado` |

Implementar como componente visual en el HTML del event-detail, encima de las pestañas.

### 2.2 Validación de Transición de Estado

Agregar lógica en el TS para:
- **Activar "Día del Evento"**: Solo permitir si `saldoPendiente() === 0`. Mostrar toast de error si el saldo es positivo.
- **Cerrar evento**: Solo permitir si `estado === 'en_progreso'`. Al cerrar, el formulario de pagos y gastos debe ser readonly.

```typescript
// Computed para saldo pendiente (si no existe ya):
readonly saldoPendiente = computed(() => {
  const c = this.contract();
  if (!c) return 0;
  // total del contrato menos suma de pagos recibidos
  return c.monto_total - (c.pagos_recibidos ?? 0);
});

canAdvanceToEventDay(): boolean {
  return this.saldoPendiente() === 0;
}
```

### 2.3 Bloqueo de Edición en Estado "Concluido"

Cuando `contract().estado === 'concluido'` o `=== 'cancelado'`:
- Los botones de "Registrar Abono" y "Agregar Gasto" deben estar `[disabled]="true"` y visualmente opacos.
- Mostrar banner informativo: _"Este evento ha concluido. Los registros financieros están bloqueados."_

---

## Fase 3: Migración SQL — Cost Centers, Anti-Doble-Booking y Trigger

Crear archivo: `supabase/migrations/20260527000001_pos_cost_center_integration.sql`

### 3.1 Columnas de Imputación en `pos_sales`

```sql
ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS playdate_date DATE,
  ADD COLUMN IF NOT EXISTS playdate_time_slot_id UUID REFERENCES time_slots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_sales_event_scope
  ON pos_sales(contract_id) WHERE contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_sales_playdate_scope
  ON pos_sales(playdate_date, playdate_time_slot_id)
  WHERE playdate_date IS NOT NULL;
```

### 3.2 Índice Anti-Doble-Booking

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_private_reservations_confirmed_slot
  ON private_reservations(reservation_date, time_slot_id)
  WHERE status IN ('confirmed', 'completed');
```

Las reservas en `pending_payment` pueden coexistir. El índice bloquea solo una reserva confirmada por slot.

### 3.3 Trigger: Reserva Confirmada → Cliente + Contrato Automático

> **Caso crítico manejado:** Si `quote_id IS NULL` (reserva directa sin cotización previa), el trigger igual crea el cliente y el contrato. Solo salta la actualización de `quotes.estado`.

```sql
CREATE OR REPLACE FUNCTION fn_reservation_confirmed_to_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id   UUID;
  v_contract_id UUID;
  v_folio       TEXT;
BEGIN
  -- Solo actuar cuando cambia a 'confirmed' desde otro estado
  IF NEW.status <> 'confirmed' OR OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- 1. Upsert cliente en CRM por email
  INSERT INTO clients (nombre, email, telefono)
  VALUES (NEW.guest_name, NEW.guest_email, NEW.guest_phone)
  ON CONFLICT (email) DO UPDATE
    SET nombre    = EXCLUDED.nombre,
        telefono  = COALESCE(EXCLUDED.telefono, clients.telefono)
  RETURNING id INTO v_client_id;

  -- Si no se retornó (el cliente ya existía y no hubo RETURNING), buscarlo
  IF v_client_id IS NULL THEN
    SELECT id INTO v_client_id FROM clients WHERE email = NEW.guest_email;
  END IF;

  -- 2. Actualizar cotización si existe
  IF NEW.quote_id IS NOT NULL THEN
    UPDATE quotes SET estado = 'aprobada' WHERE id = NEW.quote_id;
  END IF;

  -- 3. Generar folio único para el contrato
  v_folio := 'C-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(NEW.id::TEXT, 1, 6));

  -- 4. Crear contrato en estado 'reservado'
  INSERT INTO contracts (
    folio, venue_id, client_id, quote_id,
    fecha_evento, hora_inicio, hora_fin,
    monto_total, estado
  )
  SELECT
    v_folio,
    NEW.venue_id,
    v_client_id,
    NEW.quote_id,
    NEW.reservation_date,
    ts.start_time,
    ts.end_time,
    NEW.total_cents / 100.0,
    'reservado'
  FROM time_slots ts
  WHERE ts.id = NEW.time_slot_id
  RETURNING id INTO v_contract_id;

  -- 5. Registrar pago del anticipo
  IF v_contract_id IS NOT NULL AND COALESCE(NEW.paid_deposit_cents, 0) > 0 THEN
    INSERT INTO contract_payments (
      contract_id, monto, metodo, notas
    ) VALUES (
      v_contract_id,
      NEW.paid_deposit_cents / 100.0,
      'mercado_pago',
      'Anticipo registrado automáticamente al confirmar reserva en línea'
    );
  END IF;

  -- 6. Actualizar la reserva con el contract_id generado
  NEW.contract_id := v_contract_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservation_confirmed ON private_reservations;
CREATE TRIGGER trg_reservation_confirmed
  BEFORE UPDATE ON private_reservations
  FOR EACH ROW
  EXECUTE FUNCTION fn_reservation_confirmed_to_contract();
```

> **Nota sobre Edge Functions:** La función `create-payment` de Mercado Pago se despliega en Supabase Cloud y no está versionada localmente. El trigger anterior se activará cuando el webhook de Mercado Pago actualice `private_reservations.status = 'confirmed'` directamente en la DB.

---

## Fase 4: Punto de Venta Dinámico — Smart Products y Selector de Imputación

### 4.1 Tipo "Acceso" para Boletos Play Day en `restaurant_items`

Los boletos de Play Day se modelan como `restaurant_items` con una nueva categoría `acceso`. Agregar a la migración de Fase 3 (o crear `20260527000002_pos_playdate_tickets.sql`):

```sql
-- Extender el tipo de categoría de restaurant_items si es un ENUM
-- Si es TEXT, no requiere migración de tipo.
-- Crear item de boleto por venue usando el precio configurado en venue_config:
INSERT INTO restaurant_items (venue_id, nombre, categoria, precio, is_active, descripcion)
SELECT
  v.id,
  'Boleto Play Day',
  'acceso',
  vc.playdate_ticket_price_cents / 100.0,
  true,
  'Entrada individual para sesión de Play Day'
FROM venues v
JOIN venue_config vc ON vc.venue_id = v.id
ON CONFLICT DO NOTHING;
```

Verificar si `restaurant_items.categoria` es ENUM o TEXT. Si es ENUM, agregar `'acceso'` al tipo antes del INSERT.

### 4.2 Verificación de Capacidad al Agregar Boleto al Carrito

En el componente POS (`admin-pos`), al agregar un `restaurant_item` con `categoria = 'acceso'` al carrito:

```typescript
// En admin-pos.ts — al añadir item al carrito:
async addItemToCart(item: RestaurantItem): Promise<void> {
  if (item.categoria === 'acceso') {
    // Verificar capacidad disponible
    const today = new Date().toISOString().split('T')[0];
    const activeSlotId = this.activeTimeSlotId(); // signal del turno activo
    if (!activeSlotId) {
      this.showToast('error', 'Selecciona el turno activo de Play Day primero.');
      return;
    }
    const maxCap = this.venueConfig()?.max_capacity_per_slot ?? 20;
    const available = await this.reservationService.getPlaydateAvailability(today, activeSlotId, maxCap);
    if (available <= 0) {
      this.showToast('warn', '¡Cupo de Play Day completo para este turno!');
      return;
    }
  }
  // Agregar al carrito normalmente
  this.cartItems.update(items => [...items, { ...item, quantity: 1 }]);
}
```

### 4.3 Selector de Imputación en Cabecera del POS

Agregar un dropdown en el header del POS con tres opciones:
- **Venta Libre** (default) — `scopeType = 'libre'`
- **Evento Privado** — `scopeType = 'contrato'`, muestra buscador de contratos del día
- **Play Day** — `scopeType = 'playdate'`, muestra el turno activo

Al confirmar la venta, el payload de `pos_sales` incluye:
```typescript
{
  contract_id: scopeType === 'contrato' ? selectedContractId() : null,
  playdate_date: scopeType === 'playdate' ? today : null,
  playdate_time_slot_id: scopeType === 'playdate' ? activeSlotId() : null,
}
```

Al finalizar una venta con boletos de `categoria = 'acceso'`, crear registros en `playdate_reservations` con `status = 'confirmed'` para descontar el cupo en tiempo real.

---

## Fase 5: Actualizar Vista `event_profit_loss` con Transaction-Level Scoping

La vista actual usa `pos_sessions.contract_id` (nivel de sesión). Con la Fase 3, `pos_sales` ahora tiene `contract_id` directamente. Hay que recrear la vista.

Crear `supabase/migrations/20260527000003_update_event_profit_loss_view.sql`:

```sql
-- Recrear la vista usando transaction-level scoping (pos_sales.contract_id)
DROP VIEW IF EXISTS event_profit_loss;

CREATE VIEW event_profit_loss AS
SELECT
  c.id                                                                   AS contract_id,
  c.folio,
  c.client_id,
  cl.nombre                                                              AS client_nombre,
  c.fecha_evento,
  c.monto_total,
  c.estado,

  -- Pagos recibidos del contrato
  COALESCE((
    SELECT SUM(cp.monto) FROM contract_payments cp WHERE cp.contract_id = c.id
  ), 0)                                                                  AS pagos_recibidos,

  -- Saldo pendiente
  c.monto_total - COALESCE((
    SELECT SUM(cp.monto) FROM contract_payments cp WHERE cp.contract_id = c.id
  ), 0)                                                                  AS saldo_pendiente,

  -- Items cotizados
  COALESCE((
    SELECT SUM(qi.subtotal) FROM quote_items qi WHERE qi.quote_id = c.quote_id
  ), 0)                                                                  AS extras_cotizados,

  -- Ingresos POS imputados al contrato (transaction-level — NUEVA LÓGICA)
  COALESCE((
    SELECT SUM(ps.total)
    FROM pos_sales ps
    WHERE ps.contract_id = c.id
  ), 0)                                                                  AS ingresos_pos,

  -- Ingreso total
  c.monto_total
  + COALESCE((SELECT SUM(qi.subtotal) FROM quote_items qi WHERE qi.quote_id = c.quote_id), 0)
  + COALESCE((SELECT SUM(ps.total) FROM pos_sales ps WHERE ps.contract_id = c.id), 0)
                                                                         AS ingreso_total,

  -- Egresos
  COALESCE((SELECT SUM(p.total) FROM purchases p WHERE p.contract_id = c.id), 0)
                                                                         AS compras_evento,

  COALESCE((SELECT SUM(ae.monto) FROM admin_expenses ae WHERE ae.contract_id = c.id), 0)
                                                                         AS gastos_directos,

  -- Utilidad neta
  c.monto_total
  + COALESCE((SELECT SUM(qi.subtotal) FROM quote_items qi WHERE qi.quote_id = c.quote_id), 0)
  + COALESCE((SELECT SUM(ps.total) FROM pos_sales ps WHERE ps.contract_id = c.id), 0)
  - COALESCE((SELECT SUM(p.total) FROM purchases p WHERE p.contract_id = c.id), 0)
  - COALESCE((SELECT SUM(ae.monto) FROM admin_expenses ae WHERE ae.contract_id = c.id), 0)
                                                                         AS utilidad_neta

FROM contracts c
LEFT JOIN clients cl ON cl.id = c.client_id;

-- P&L de Play Day por turno (nueva vista adicional)
CREATE OR REPLACE VIEW playdate_profit_loss AS
SELECT
  pr.reservation_date                                                    AS fecha,
  pr.time_slot_id,
  ts.label                                                               AS turno,
  COUNT(*) FILTER (WHERE pr.status = 'confirmed')                        AS boletos_vendidos,
  COALESCE(SUM(pr.total_cents) FILTER (WHERE pr.status = 'confirmed'), 0) / 100.0
                                                                         AS ingresos_boletaje,
  COALESCE((
    SELECT SUM(ps.total)
    FROM pos_sales ps
    WHERE ps.playdate_date = pr.reservation_date
      AND ps.playdate_time_slot_id = pr.time_slot_id
  ), 0)                                                                  AS ingresos_cafeteria,
  COALESCE(SUM(pr.total_cents) FILTER (WHERE pr.status = 'confirmed'), 0) / 100.0
  + COALESCE((
    SELECT SUM(ps.total)
    FROM pos_sales ps
    WHERE ps.playdate_date = pr.reservation_date
      AND ps.playdate_time_slot_id = pr.time_slot_id
  ), 0)                                                                  AS ingreso_total_turno
FROM playdate_reservations pr
JOIN time_slots ts ON ts.id = pr.time_slot_id
GROUP BY pr.reservation_date, pr.time_slot_id, ts.label;
```

---

## Checklist de Calidad por Fase

Antes de cada commit:
- [ ] `npx tsc --noEmit` — cero errores TypeScript
- [ ] `ng build` — build de producción exitoso
- [ ] Verificar que no se rompan las rutas existentes
- [ ] Las signals usan `.set()` / `.update()` — nunca `.mutate()`
- [ ] No hay `NgZone`, `ChangeDetectorRef`, ni `async ngOnInit()`
- [ ] Los pipes de moneda no incluyen `'es-MX'` como 4to parámetro
