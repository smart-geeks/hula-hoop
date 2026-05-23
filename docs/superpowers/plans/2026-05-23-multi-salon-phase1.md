# Multi-Salón Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar soporte multi-salón al backoffice sin romper lógica de negocio — tabla `venues`, RBAC via `venue_users`, `venue_id` en 12 tablas raíz, `VenueService` singleton con señal reactiva, `VenueSwitcher` en layout, página `AdminVenues`.

**Architecture:** Una migración SQL atómica crea `venues`/`venue_users` y agrega `venue_id` FK a 12 tablas; una función `SECURITY DEFINER` `user_venue_ids()` es la única fuente de verdad para RLS (cacheable por transacción, sin subquery O(n)); `VenueService` expone `currentVenueId` signal que todos los servicios consumen; `VenueSwitcher` en admin layout permite cambio de salón. Datos existentes se migran automáticamente al salón por defecto (UUID fijo).

**Tech Stack:** Supabase (PostgreSQL, RLS, SECURITY DEFINER), Angular 20 Zoneless (signals, effect(), computed(), ChangeDetectionStrategy.OnPush), PrimeNG, Tailwind CSS, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-05-23-multi-salon-phase1-design.md`

---

## File Map

| Acción | Archivo |
|--------|---------|
| Crear | `supabase/migrations/20260523000004_multi_venue_phase1.sql` |
| Crear | `src/app/core/interfaces/venue.ts` |
| Modificar | `src/app/core/interfaces/contract.ts` |
| Modificar | `src/app/core/interfaces/quote.ts` |
| Modificar | `src/app/core/interfaces/pos.ts` |
| Modificar | `src/app/core/interfaces/inventory.ts` |
| Modificar | `src/app/core/interfaces/expense.ts` |
| Modificar | `src/app/core/interfaces/supplier.ts` |
| Modificar | `src/app/core/interfaces/purchase.ts` |
| Modificar | `src/app/core/interfaces/venue-config.ts` |
| Crear | `src/app/core/services/venue.service.ts` |
| Modificar | `src/app/core/services/contract.service.ts` |
| Modificar | `src/app/core/services/quote.service.ts` |
| Modificar | `src/app/core/services/pos.service.ts` |
| Modificar | `src/app/core/services/cashier.service.ts` |
| Modificar | `src/app/core/services/expense.service.ts` |
| Modificar | `src/app/core/services/supplier.service.ts` |
| Modificar | `src/app/core/services/purchase.service.ts` |
| Modificar | `src/app/core/services/inventory.service.ts` |
| Modificar | `src/app/core/services/venue-config.service.ts` |
| Crear | `src/app/features/admin/components/venue-switcher/venue-switcher.ts` |
| Crear | `src/app/features/admin/components/venue-switcher/venue-switcher.html` |
| Crear | `src/app/features/admin/pages/admin-venues/admin-venues.ts` |
| Crear | `src/app/features/admin/pages/admin-venues/admin-venues.html` |
| Modificar | `src/app/features/admin/pages/admin-layout/admin-layout.ts` |
| Modificar | `src/app/features/admin/pages/admin-layout/admin-layout.html` |
| Modificar | `src/app/features/admin/admin.routes.ts` |

---

## Task 1: SQL Migration — venues, venue_users, venue_id en 12 tablas, RLS

**Files:**
- Create: `supabase/migrations/20260523000004_multi_venue_phase1.sql`

- [ ] **Step 1: Crear el archivo de migración**

Crear `supabase/migrations/20260523000004_multi_venue_phase1.sql`:

```sql
-- ==============================================================================
-- Migration: 20260523000004_multi_venue_phase1.sql
-- Multi-salón Phase 1: venues, venue_users, venue_id en 12 tablas raíz, RLS
--
-- REGLA: No rompe lógica de negocio. Solo agrega la dimensión venue_id.
-- Todos los datos existentes se asignan al salón por defecto (UUID fijo).
-- Patrón seguro: ADD COLUMN nullable → UPDATE masivo → SET NOT NULL
-- ==============================================================================

-- ── PARTE 1: Función RLS helper ───────────────────────────────────────────────
-- SECURITY DEFINER + STABLE: el planner cachéa el resultado por transacción.
-- Evita subquery O(n) por cada fila escaneada en las políticas.
CREATE OR REPLACE FUNCTION user_venue_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT venue_id FROM venue_users WHERE user_id = auth.uid();
$$;

-- ── PARTE 2: Tabla venues ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venues (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  direccion  TEXT,
  telefono   TEXT,
  email      TEXT,
  logo_url   TEXT,
  activo     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venues_select"  ON venues;
DROP POLICY IF EXISTS "venues_manage"  ON venues;

-- Usuarios ven solo los venues a los que pertenecen
CREATE POLICY "venues_select" ON venues
  FOR SELECT TO authenticated
  USING (id = ANY(user_venue_ids()));

-- Solo owners pueden crear/modificar venues
CREATE POLICY "venues_manage" ON venues
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venue_users vu
      WHERE vu.venue_id = venues.id
        AND vu.user_id  = auth.uid()
        AND vu.role     = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM venue_users vu
      WHERE vu.venue_id = venues.id
        AND vu.user_id  = auth.uid()
        AND vu.role     = 'owner'
    )
  );

-- Salón por defecto: UUID fijo para referenciar desde UPDATE masivo
INSERT INTO venues (id, nombre, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Salón Principal', 'salon-principal')
ON CONFLICT (id) DO NOTHING;

-- ── PARTE 3: Tabla venue_users ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_users (
  venue_id   UUID NOT NULL REFERENCES venues(id)     ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'staff'
               CHECK (role IN ('owner','admin','staff','readonly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (venue_id, user_id)
);

ALTER TABLE venue_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_users_self_select"       ON venue_users;
DROP POLICY IF EXISTS "venue_users_managers_select"   ON venue_users;
DROP POLICY IF EXISTS "venue_users_owners_manage"     ON venue_users;

-- Cada usuario puede ver sus propias membresías (necesario para user_venue_ids())
CREATE POLICY "venue_users_self_select" ON venue_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Owners y admins pueden ver todos los miembros de su venue
CREATE POLICY "venue_users_managers_select" ON venue_users
  FOR SELECT TO authenticated
  USING (
    venue_id = ANY(user_venue_ids())
    AND EXISTS (
      SELECT 1 FROM venue_users vu2
      WHERE vu2.venue_id = venue_users.venue_id
        AND vu2.user_id  = auth.uid()
        AND vu2.role IN ('owner','admin')
    )
  );

-- Solo owners pueden gestionar membresías (INSERT/UPDATE/DELETE)
CREATE POLICY "venue_users_owners_manage" ON venue_users
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venue_users vu2
      WHERE vu2.venue_id = venue_users.venue_id
        AND vu2.user_id  = auth.uid()
        AND vu2.role     = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM venue_users vu2
      WHERE vu2.venue_id = venue_users.venue_id
        AND vu2.user_id  = auth.uid()
        AND vu2.role     = 'owner'
    )
  );

-- Poblar venue_users: TODOS los usuarios existentes acceden al salón por defecto.
-- Sin este paso la nueva RLS bloquearía el acceso a todos sus datos.
INSERT INTO venue_users (venue_id, user_id, role)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  p.id,
  CASE p.role
    WHEN 'owner'    THEN 'owner'
    WHEN 'admin'    THEN 'admin'
    WHEN 'readonly' THEN 'readonly'
    ELSE                 'staff'
  END
FROM profiles p
WHERE p.role IN ('owner','admin','staff','readonly')
ON CONFLICT (venue_id, user_id) DO NOTHING;

-- ── PARTE 4: venue_id en las 12 tablas raíz ──────────────────────────────────
-- Patrón por tabla: ADD COLUMN nullable → UPDATE → NOT NULL

-- venue_config
ALTER TABLE venue_config
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
UPDATE venue_config SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
ALTER TABLE venue_config ALTER COLUMN venue_id SET NOT NULL;

-- contracts
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
UPDATE contracts SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
ALTER TABLE contracts ALTER COLUMN venue_id SET NOT NULL;

-- quotes
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
UPDATE quotes SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
ALTER TABLE quotes ALTER COLUMN venue_id SET NOT NULL;

-- pos_sessions
ALTER TABLE pos_sessions
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
UPDATE pos_sessions SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
ALTER TABLE pos_sessions ALTER COLUMN venue_id SET NOT NULL;

-- inventory_items — también corrige el constraint UNIQUE global de SKU
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
UPDATE inventory_items SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
ALTER TABLE inventory_items ALTER COLUMN venue_id SET NOT NULL;
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_sku_key;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_venue_sku_unique
  UNIQUE (venue_id, sku);

-- admin_expenses
ALTER TABLE admin_expenses
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
UPDATE admin_expenses SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
ALTER TABLE admin_expenses ALTER COLUMN venue_id SET NOT NULL;

-- suppliers
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
UPDATE suppliers SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
ALTER TABLE suppliers ALTER COLUMN venue_id SET NOT NULL;

-- purchases
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
UPDATE purchases SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
ALTER TABLE purchases ALTER COLUMN venue_id SET NOT NULL;

-- cashier_profiles
ALTER TABLE cashier_profiles
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
UPDATE cashier_profiles SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
ALTER TABLE cashier_profiles ALTER COLUMN venue_id SET NOT NULL;

-- private_reservations (producción pre-existente)
ALTER TABLE private_reservations
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
UPDATE private_reservations SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
ALTER TABLE private_reservations ALTER COLUMN venue_id SET NOT NULL;

-- playdate_reservations (producción pre-existente)
ALTER TABLE playdate_reservations
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
UPDATE playdate_reservations SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
ALTER TABLE playdate_reservations ALTER COLUMN venue_id SET NOT NULL;

-- time_slots (producción pre-existente)
ALTER TABLE time_slots
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
UPDATE time_slots SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
ALTER TABLE time_slots ALTER COLUMN venue_id SET NOT NULL;

-- ── PARTE 5: Índices en venue_id ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_venue_config_venue_id          ON venue_config(venue_id);
CREATE INDEX IF NOT EXISTS idx_contracts_venue_id             ON contracts(venue_id);
CREATE INDEX IF NOT EXISTS idx_quotes_venue_id                ON quotes(venue_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_venue_id          ON pos_sessions(venue_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_venue_id       ON inventory_items(venue_id);
CREATE INDEX IF NOT EXISTS idx_admin_expenses_venue_id        ON admin_expenses(venue_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_venue_id             ON suppliers(venue_id);
CREATE INDEX IF NOT EXISTS idx_purchases_venue_id             ON purchases(venue_id);
CREATE INDEX IF NOT EXISTS idx_cashier_profiles_venue_id      ON cashier_profiles(venue_id);
CREATE INDEX IF NOT EXISTS idx_private_reservations_venue_id  ON private_reservations(venue_id);
CREATE INDEX IF NOT EXISTS idx_playdate_reservations_venue_id ON playdate_reservations(venue_id);
CREATE INDEX IF NOT EXISTS idx_time_slots_venue_id            ON time_slots(venue_id);

-- ── PARTE 6: RLS actualizada en las 12 tablas ─────────────────────────────────
-- Patrón: DROP política existente → CREATE nueva con user_venue_ids()

DROP POLICY IF EXISTS "venue_config_auth"    ON venue_config;
CREATE POLICY "venue_config_venue" ON venue_config FOR ALL TO authenticated
  USING (venue_id = ANY(user_venue_ids()))
  WITH CHECK (venue_id = ANY(user_venue_ids()));

DROP POLICY IF EXISTS "contracts_auth"       ON contracts;
CREATE POLICY "contracts_venue" ON contracts FOR ALL TO authenticated
  USING (venue_id = ANY(user_venue_ids()))
  WITH CHECK (venue_id = ANY(user_venue_ids()));

DROP POLICY IF EXISTS "quotes_auth"          ON quotes;
CREATE POLICY "quotes_venue" ON quotes FOR ALL TO authenticated
  USING (venue_id = ANY(user_venue_ids()))
  WITH CHECK (venue_id = ANY(user_venue_ids()));

DROP POLICY IF EXISTS "pos_sessions_auth"    ON pos_sessions;
CREATE POLICY "pos_sessions_venue" ON pos_sessions FOR ALL TO authenticated
  USING (venue_id = ANY(user_venue_ids()))
  WITH CHECK (venue_id = ANY(user_venue_ids()));

DROP POLICY IF EXISTS "inventory_items_auth" ON inventory_items;
CREATE POLICY "inventory_items_venue" ON inventory_items FOR ALL TO authenticated
  USING (venue_id = ANY(user_venue_ids()))
  WITH CHECK (venue_id = ANY(user_venue_ids()));

DROP POLICY IF EXISTS "admin_expenses_auth"  ON admin_expenses;
CREATE POLICY "admin_expenses_venue" ON admin_expenses FOR ALL TO authenticated
  USING (venue_id = ANY(user_venue_ids()))
  WITH CHECK (venue_id = ANY(user_venue_ids()));

DROP POLICY IF EXISTS "suppliers_auth"       ON suppliers;
CREATE POLICY "suppliers_venue" ON suppliers FOR ALL TO authenticated
  USING (venue_id = ANY(user_venue_ids()))
  WITH CHECK (venue_id = ANY(user_venue_ids()));

DROP POLICY IF EXISTS "purchases_auth"       ON purchases;
CREATE POLICY "purchases_venue" ON purchases FOR ALL TO authenticated
  USING (venue_id = ANY(user_venue_ids()))
  WITH CHECK (venue_id = ANY(user_venue_ids()));

DROP POLICY IF EXISTS "cashier_profiles_auth" ON cashier_profiles;
CREATE POLICY "cashier_profiles_venue" ON cashier_profiles FOR ALL TO authenticated
  USING (venue_id = ANY(user_venue_ids()))
  WITH CHECK (venue_id = ANY(user_venue_ids()));

-- Tablas de producción pre-existentes: habilitar RLS si no estaba activo
ALTER TABLE private_reservations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE playdate_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots            ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "private_reservations_auth"    ON private_reservations;
DROP POLICY IF EXISTS "private_reservations_venue"   ON private_reservations;
CREATE POLICY "private_reservations_venue" ON private_reservations FOR ALL TO authenticated
  USING (venue_id = ANY(user_venue_ids()))
  WITH CHECK (venue_id = ANY(user_venue_ids()));

DROP POLICY IF EXISTS "playdate_reservations_auth"   ON playdate_reservations;
DROP POLICY IF EXISTS "playdate_reservations_venue"  ON playdate_reservations;
CREATE POLICY "playdate_reservations_venue" ON playdate_reservations FOR ALL TO authenticated
  USING (venue_id = ANY(user_venue_ids()))
  WITH CHECK (venue_id = ANY(user_venue_ids()));

DROP POLICY IF EXISTS "time_slots_auth"  ON time_slots;
DROP POLICY IF EXISTS "time_slots_venue" ON time_slots;
CREATE POLICY "time_slots_venue" ON time_slots FOR ALL TO authenticated
  USING (venue_id = ANY(user_venue_ids()))
  WITH CHECK (venue_id = ANY(user_venue_ids()));

-- ── PARTE 7: RPC create_cashier actualizada ───────────────────────────────────
-- Se agrega p_venue_id UUID. El servicio Angular se actualiza en la misma PR.
CREATE OR REPLACE FUNCTION create_cashier(
  p_nombre   TEXT,
  p_pin      TEXT,
  p_venue_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO cashier_profiles (nombre, pin_hash, venue_id)
  VALUES (p_nombre, crypt(p_pin, gen_salt('bf', 8)), p_venue_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION create_cashier IS
  'Crea un cajero con PIN hasheado (bcrypt cost=8) asignado al venue dado. '
  'SECURITY DEFINER: el hash nunca regresa al cliente.';

-- ── PARTE 8: Vistas actualizadas con venue_id ────────────────────────────────

CREATE OR REPLACE VIEW pos_sales_detail AS
SELECT
  sale.id,
  sale.session_id,
  sale.folio,
  sale.total,
  sale.pagado_con,
  sale.created_at,
  sale.cashier_id,
  cashier.nombre       AS cashier_nombre,
  sess.contract_id,
  sess.venue_id,
  sess.opened_at       AS session_opened_at,
  sess.closed_at       AS session_closed_at,
  contract.folio       AS contract_folio,
  contract.fecha_evento
FROM pos_sales             sale
LEFT JOIN cashier_profiles cashier  ON cashier.id  = sale.cashier_id
LEFT JOIN pos_sessions     sess     ON sess.id      = sale.session_id
LEFT JOIN contracts        contract ON contract.id  = sess.contract_id;

COMMENT ON VIEW pos_sales_detail IS
  'Ventas POS enriquecidas: nombre de cajero, sesión, contrato y venue. Solo lectura.';

CREATE OR REPLACE VIEW event_profit_loss AS
SELECT
  c.id             AS contract_id,
  c.venue_id,
  c.folio,
  c.fecha_evento,
  c.estado,
  cl.nombre        AS cliente,
  c.salon_renta,
  COALESCE((
    SELECT SUM(qi.subtotal) FROM quote_items qi WHERE qi.quote_id = c.quote_id
  ), 0) AS extras_cotizados,
  COALESCE((
    SELECT SUM(ps.total) FROM pos_sessions sess
    JOIN pos_sales ps ON ps.session_id = sess.id WHERE sess.contract_id = c.id
  ), 0) AS ventas_pos,
  c.salon_renta
    + COALESCE((SELECT SUM(qi.subtotal) FROM quote_items qi WHERE qi.quote_id = c.quote_id), 0)
    + COALESCE((
        SELECT SUM(ps.total) FROM pos_sessions sess
        JOIN pos_sales ps ON ps.session_id = sess.id WHERE sess.contract_id = c.id
      ), 0) AS total_ingresos,
  COALESCE((SELECT SUM(p.total) FROM purchases p WHERE p.contract_id = c.id), 0)
    AS compras_evento,
  COALESCE((
    SELECT SUM(ABS(im.cantidad) * ii.precio_costo)
    FROM inventory_movements im JOIN inventory_items ii ON ii.id = im.item_id
    WHERE im.contract_id = c.id AND im.tipo = 'salida'
  ), 0) AS consumo_inventario,
  COALESCE((SELECT SUM(ae.monto) FROM admin_expenses ae WHERE ae.contract_id = c.id), 0)
    AS gastos_directos,
  c.deposito_pagado,
  c.saldo_pendiente,
  c.total_contrato
FROM contracts c
LEFT JOIN clients cl ON cl.id = c.client_id;
```

- [ ] **Step 2: Aplicar migración a Supabase remote**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx supabase db push
```

Salida esperada: lista de migraciones aplicadas sin errores.

- [ ] **Step 3: Verificar tablas creadas**

```bash
npx supabase db remote query "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('venues','venue_users') ORDER BY 1;"
```

Esperado:
```
 table_name
────────────
 venue_users
 venues
```

- [ ] **Step 4: Verificar venue_id NOT NULL en contracts**

```bash
npx supabase db remote query "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'venue_id';"
```

Esperado: `is_nullable = NO`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260523000004_multi_venue_phase1.sql
git commit -m "feat(db): multi-salon Phase 1 — venues, venue_users, venue_id en 12 tablas, RLS"
```

---

## Task 2: Interfaces — venue.ts nueva + 8 interfaces actualizadas

**Files:**
- Create: `src/app/core/interfaces/venue.ts`
- Modify: `src/app/core/interfaces/contract.ts`, `quote.ts`, `pos.ts`, `inventory.ts`, `expense.ts`, `supplier.ts`, `purchase.ts`, `venue-config.ts`

- [ ] **Step 1: Crear venue.ts**

Crear `src/app/core/interfaces/venue.ts`:

```typescript
export interface Venue {
  id: string;
  nombre: string;
  slug: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  logo_url?: string;
  activo: boolean;
  created_at: string;
}

export interface VenueUser {
  venue_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'staff' | 'readonly';
  created_at: string;
}

export interface CreateVenueData {
  nombre: string;
  slug: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  logo_url?: string;
}

export type UpdateVenueData = Partial<CreateVenueData> & { activo?: boolean };
```

- [ ] **Step 2: Actualizar contract.ts**

Agregar `venue_id: string` a `Contract` (después de `id`) y `venue_id?: string` a `CreateContractData` (primera propiedad):

```typescript
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
  notas: string | null;
  created_at: string;
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
  notas?: string;
}

export type UpdateContractData = Partial<CreateContractData>;
```

- [ ] **Step 3: Actualizar quote.ts**

Agregar `venue_id: string` a `Quote` y `venue_id?: string` a `CreateQuoteData`:

```typescript
export interface Quote {
  id: string;
  venue_id: string;
  folio: string;
  public_token: string;
  client_id: string | null;
  fecha: string;
  fecha_evento: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  guest_count: number | null;
  estado: QuoteStatus;
  subtotal: number;
  descuento: number;
  total: number;
  deposit_amount: number | null;
  notas: string | null;
  created_at: string;
  client?: { nombre: string; email: string | null; telefono: string | null };
  items?: QuoteItem[];
}

export interface CreateQuoteData {
  venue_id?: string;
  client_id?: string;
  fecha: string;
  fecha_evento?: string;
  hora_inicio?: string;
  hora_fin?: string;
  guest_count?: number;
  estado?: QuoteStatus;
  subtotal: number;
  descuento?: number;
  total: number;
  deposit_amount?: number;
  notas?: string;
  items: Omit<QuoteItem, 'id' | 'quote_id' | 'subtotal'>[];
}

export type UpdateQuoteData = Partial<Omit<CreateQuoteData, 'items'>>;
```

- [ ] **Step 4: Actualizar pos.ts**

Agregar `venue_id: string` a `CashierProfile` y `PosSession`:

```typescript
export interface CashierProfile {
  id: string;
  venue_id: string;
  nombre: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PosSession {
  id: string;
  venue_id: string;
  contract_id: string | null;
  cashier_id: string | null;
  opened_at: string;
  closed_at: string | null;
  total_ventas: number;
  created_by: string | null;
  contract?: { folio: string; fecha_evento: string };
  cashier?: { nombre: string };
}
```

El resto de `pos.ts` (PaymentMethod, PosSaleItem, PosSale, CartItem, CreateSaleData) no cambia.

- [ ] **Step 5: Actualizar inventory.ts**

Agregar `venue_id: string` a `InventoryItem` y `venue_id?: string` a `CreateInventoryItemData`:

```typescript
export interface InventoryItem {
  id: string;
  venue_id: string;
  nombre: string;
  sku: string | null;
  categoria: string | null;
  unidad: string;
  stock_actual: number;
  stock_minimo: number;
  precio_costo: number;
  precio_venta: number;
  activo: boolean;
  created_at: string;
}

export interface CreateInventoryItemData {
  venue_id?: string;
  nombre: string;
  sku?: string;
  categoria?: string;
  unidad?: string;
  stock_actual?: number;
  stock_minimo?: number;
  precio_costo?: number;
  precio_venta?: number;
  activo?: boolean;
}
```

El resto de `inventory.ts` (MovementType, InventoryMovement, CreateMovementData, UpdateInventoryItemData, INVENTORY_CATEGORIES) no cambia.

- [ ] **Step 6: Actualizar expense.ts**

Agregar `venue_id: string` a `AdminExpense` y `venue_id?: string` a `CreateExpenseData`:

```typescript
export interface AdminExpense {
  id: string;
  venue_id: string;
  categoria: string;
  descripcion: string;
  monto: number;
  fecha: string;
  comprobante_url: string | null;
  contract_id: string | null;
  supplier_id: string | null;
  created_at: string;
  contract?: { folio: string; fecha_evento: string };
  supplier?: { nombre: string };
}

export interface CreateExpenseData {
  venue_id?: string;
  categoria: string;
  descripcion: string;
  monto: number;
  fecha: string;
  comprobante_url?: string;
  contract_id?: string;
  supplier_id?: string;
}

export type UpdateExpenseData = Partial<CreateExpenseData>;
```

EXPENSE_CATEGORIES no cambia.

- [ ] **Step 7: Actualizar supplier.ts**

Agregar `venue_id: string` a `Supplier` y `venue_id?: string` a `CreateSupplierData`:

```typescript
export interface Supplier {
  id: string;
  venue_id: string;
  nombre: string;
  categoria: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string;
}

export interface CreateSupplierData {
  venue_id?: string;
  nombre: string;
  categoria?: string;
  contacto?: string;
  telefono?: string;
  email?: string;
  notas?: string;
  activo?: boolean;
}

export type UpdateSupplierData = Partial<CreateSupplierData>;
```

SUPPLIER_CATEGORIES no cambia.

- [ ] **Step 8: Actualizar purchase.ts**

Agregar `venue_id: string` a `Purchase` y `venue_id?: string` a `CreatePurchaseData`:

```typescript
export interface Purchase {
  id: string;
  venue_id: string;
  folio: string;
  supplier_id: string | null;
  contract_id: string | null;
  fecha: string;
  total: number;
  estado: PurchaseStatus;
  notas: string | null;
  created_at: string;
  supplier?: { nombre: string };
  contract?: { folio: string; fecha_evento: string };
  items?: PurchaseItem[];
}

export interface CreatePurchaseData {
  venue_id?: string;
  supplier_id?: string;
  contract_id?: string;
  fecha: string;
  total: number;
  estado?: PurchaseStatus;
  notas?: string;
  items: Omit<PurchaseItem, 'id' | 'purchase_id' | 'subtotal'>[];
}

export type UpdatePurchaseData = Partial<Omit<CreatePurchaseData, 'items'>>;
```

- [ ] **Step 9: Actualizar venue-config.ts**

```typescript
export interface VenueConfig {
  id: string;
  venue_id: string;
  max_capacity_per_slot: number;
  playdate_ticket_price_cents: number;
  playdate_extra_adult_price_cents: number;
  min_hours_before_private: number;
  private_booking_horizon_date: string | null;
  updated_at: string;
  updated_by: string | null;
}
```

- [ ] **Step 10: Verificar compilación TypeScript**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1 | head -30
```

Esperado: solo errores en servicios (aún no actualizados), ninguno en archivos de interfaces.

- [ ] **Step 11: Commit**

```bash
git add src/app/core/interfaces/
git commit -m "feat(types): add venue_id to all multi-salon interfaces"
```

---

## Task 3: VenueService

**Files:**
- Create: `src/app/core/services/venue.service.ts`

- [ ] **Step 1: Crear venue.service.ts**

```typescript
import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import type { CreateVenueData, UpdateVenueData, Venue, VenueUser } from '../interfaces/venue';

const STORAGE_KEY = 'hh_venue_id';

@Injectable({ providedIn: 'root' })
export class VenueService {
  private readonly supabase   = inject(SupabaseService);
  private readonly auth       = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly venues         = signal<Venue[]>([]);
  readonly currentVenueId = signal<string | null>(this.readStoredId());
  readonly loading        = signal(true);
  readonly currentVenue   = computed(() =>
    this.venues().find(v => v.id === this.currentVenueId()) ?? null
  );

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      if (user) {
        this.loadVenues();
      } else {
        this.venues.set([]);
        this.currentVenueId.set(null);
        this.loading.set(false);
      }
    });
  }

  switchVenue(venueId: string): void {
    this.currentVenueId.set(venueId);
    this.storeId(venueId);
  }

  async createVenue(data: CreateVenueData): Promise<Venue | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: created, error } = await client
      .from('venues')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Error creating venue:', error.message);
      return null;
    }
    this.venues.update(vs => [...vs, created as Venue]);
    return created as Venue;
  }

  async updateVenue(id: string, data: UpdateVenueData): Promise<Venue | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: updated, error } = await client
      .from('venues')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating venue:', error.message);
      return null;
    }
    this.venues.update(vs => vs.map(v => v.id === id ? (updated as Venue) : v));
    return updated as Venue;
  }

  async getVenueUsers(venueId: string): Promise<VenueUser[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('venue_users')
      .select('*')
      .eq('venue_id', venueId)
      .order('created_at');

    if (error) {
      console.error('Error fetching venue users:', error.message);
      return [];
    }
    return (data ?? []) as VenueUser[];
  }

  async assignUser(venueId: string, userId: string, role: VenueUser['role']): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('venue_users')
      .upsert({ venue_id: venueId, user_id: userId, role }, { onConflict: 'venue_id,user_id' });

    if (error) {
      console.error('Error assigning user:', error.message);
      return false;
    }
    return true;
  }

  async removeUser(venueId: string, userId: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('venue_users')
      .delete()
      .eq('venue_id', venueId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error removing user from venue:', error.message);
      return false;
    }
    return true;
  }

  private async loadVenues(): Promise<void> {
    const client = this.supabase.client;
    if (!client) return;

    this.loading.set(true);

    const { data, error } = await client
      .from('venues')
      .select('*')
      .eq('activo', true)
      .order('nombre');

    if (error) {
      console.error('Error loading venues:', error.message);
      this.loading.set(false);
      return;
    }

    const list = (data ?? []) as Venue[];
    this.venues.set(list);

    const storedId    = this.currentVenueId();
    const validStored = list.find(v => v.id === storedId);
    const resolved    = validStored?.id ?? list[0]?.id ?? null;
    this.currentVenueId.set(resolved);
    if (resolved) this.storeId(resolved);

    this.loading.set(false);
  }

  private readStoredId(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  private storeId(id: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }
}
```

- [ ] **Step 2: Verificar compilación**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1 | grep venue.service
```

Esperado: 0 errores de venue.service.ts

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/venue.service.ts
git commit -m "feat(core): add VenueService with currentVenueId signal, venue CRUD, and localStorage persistence"
```

---

## Task 4: Actualizar ContractService

**Files:**
- Modify: `src/app/core/services/contract.service.ts`

- [ ] **Step 1: Reemplazar contract.service.ts completo**

```typescript
import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { VenueService } from './venue.service';
import type {
  Contract,
  ContractPayment,
  CreateContractData,
  UpdateContractData,
} from '../interfaces/contract';

@Injectable({ providedIn: 'root' })
export class ContractService {
  private readonly supabase = inject(SupabaseService);
  private readonly venue    = inject(VenueService);

  async getAll(): Promise<Contract[]> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return [];

    const { data, error } = await client
      .from('contracts')
      .select('*, client:clients(nombre, email, telefono)')
      .eq('venue_id', venueId)
      .order('fecha_evento', { ascending: true });

    if (error) {
      console.error('Error fetching contracts:', error.message);
      return [];
    }
    return data ?? [];
  }

  async getById(id: string): Promise<Contract | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('contracts')
      .select('*, client:clients(nombre, email, telefono), payments:contract_payments(*)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching contract:', error.message);
      return null;
    }
    return data;
  }

  async getUpcoming(days = 30): Promise<Contract[]> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return [];

    const from = new Date().toISOString().split('T')[0];
    const to   = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];

    const { data, error } = await client
      .from('contracts')
      .select('*, client:clients(nombre, email, telefono)')
      .eq('venue_id', venueId)
      .gte('fecha_evento', from)
      .lte('fecha_evento', to)
      .neq('estado', 'cancelado')
      .order('fecha_evento', { ascending: true });

    if (error) {
      console.error('Error fetching upcoming contracts:', error.message);
      return [];
    }
    return data ?? [];
  }

  async create(data: CreateContractData): Promise<Contract | null> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return null;

    const folio = await this.generateFolio(venueId);

    const { data: created, error } = await client
      .from('contracts')
      .insert({ ...data, folio, venue_id: venueId })
      .select()
      .single();

    if (error) {
      console.error('Error creating contract:', error.message);
      return null;
    }
    return created;
  }

  async update(id: string, data: UpdateContractData): Promise<Contract | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { error } = await client.from('contracts').update(data).eq('id', id);

    if (error) {
      console.error('Error updating contract:', error.message);
      return null;
    }
    return this.getById(id);
  }

  async addPayment(
    contractId: string,
    payment: Omit<ContractPayment, 'id' | 'contract_id' | 'created_at'>,
  ): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const contract = await this.getById(contractId);
    if (!contract) return false;

    const { error } = await client
      .from('contract_payments')
      .insert({ ...payment, contract_id: contractId });

    if (error) {
      console.error('Error adding payment:', error.message);
      return false;
    }

    const newDeposit = contract.deposito_pagado + payment.monto;
    await this.update(contractId, { deposito_pagado: newDeposit });
    return true;
  }

  async delete(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client.from('contracts').delete().eq('id', id);
    if (error) {
      console.error('Error deleting contract:', error.message);
      return false;
    }
    return true;
  }

  private async generateFolio(venueId: string): Promise<string> {
    const year   = new Date().getFullYear();
    const client = this.supabase.client;
    if (!client) return `CT-${year}-001`;

    const { count } = await client
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .eq('venue_id', venueId)
      .gte('created_at', `${year}-01-01`);

    const num = String((count ?? 0) + 1).padStart(3, '0');
    return `CT-${year}-${num}`;
  }
}
```

- [ ] **Step 2: Verificar compilación**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1 | grep contract.service
```

Esperado: 0 errores

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/contract.service.ts
git commit -m "feat(services): add venue_id filtering to ContractService"
```

---

## Task 5: Actualizar CashierService + ExpenseService + VenueConfigService

**Files:**
- Modify: `src/app/core/services/cashier.service.ts`
- Modify: `src/app/core/services/expense.service.ts`
- Modify: `src/app/core/services/venue-config.service.ts`

- [ ] **Step 1: Reemplazar cashier.service.ts**

```typescript
import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { VenueService } from './venue.service';
import type { CashierProfile } from '../interfaces/pos';

@Injectable({ providedIn: 'root' })
export class CashierService {
  private readonly supabase = inject(SupabaseService);
  private readonly venue    = inject(VenueService);

  async getActive(): Promise<CashierProfile[]> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return [];

    const { data, error } = await client
      .from('cashier_profiles')
      .select('id, venue_id, nombre, activo, created_at, updated_at')
      .eq('venue_id', venueId)
      .eq('activo', true)
      .order('nombre');

    if (error) {
      console.error('Error fetching cashiers:', error.message);
      return [];
    }
    return data ?? [];
  }

  async getAll(): Promise<CashierProfile[]> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return [];

    const { data, error } = await client
      .from('cashier_profiles')
      .select('id, venue_id, nombre, activo, created_at, updated_at')
      .eq('venue_id', venueId)
      .order('nombre');

    if (error) {
      console.error('Error fetching all cashiers:', error.message);
      return [];
    }
    return data ?? [];
  }

  async create(nombre: string, pin: string): Promise<CashierProfile | null> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return null;

    const { data: cashierId, error } = await client
      .rpc('create_cashier', { p_nombre: nombre, p_pin: pin, p_venue_id: venueId });

    if (error || !cashierId) {
      console.error('Error creating cashier:', error?.message);
      return null;
    }

    const { data, error: fetchError } = await client
      .from('cashier_profiles')
      .select('id, venue_id, nombre, activo, created_at, updated_at')
      .eq('id', cashierId)
      .single();

    if (fetchError) {
      console.error('Error fetching new cashier:', fetchError.message);
      return null;
    }
    return data;
  }

  async validatePin(cashierId: string, pin: string): Promise<CashierProfile | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: validatedId, error } = await client
      .rpc('validate_cashier_pin', { p_cashier_id: cashierId, p_pin: pin });

    if (error || !validatedId) return null;

    const { data, error: fetchError } = await client
      .from('cashier_profiles')
      .select('id, venue_id, nombre, activo, created_at, updated_at')
      .eq('id', validatedId)
      .single();

    if (fetchError) return null;
    return data;
  }

  async updatePin(cashierId: string, newPin: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { data, error } = await client
      .rpc('update_cashier_pin', { p_cashier_id: cashierId, p_new_pin: newPin });

    if (error) {
      console.error('Error updating PIN:', error.message);
      return false;
    }
    return data === true;
  }

  async updateNombre(cashierId: string, nombre: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('cashier_profiles')
      .update({ nombre, updated_at: new Date().toISOString() })
      .eq('id', cashierId);

    if (error) {
      console.error('Error updating cashier name:', error.message);
      return false;
    }
    return true;
  }

  async setActivo(cashierId: string, activo: boolean): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('cashier_profiles')
      .update({ activo, updated_at: new Date().toISOString() })
      .eq('id', cashierId);

    if (error) {
      console.error('Error updating cashier status:', error.message);
      return false;
    }
    return true;
  }
}
```

- [ ] **Step 2: Reemplazar expense.service.ts**

```typescript
import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { VenueService } from './venue.service';
import type { AdminExpense, CreateExpenseData, UpdateExpenseData } from '../interfaces/expense';

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly supabase = inject(SupabaseService);
  private readonly venue    = inject(VenueService);

  async getAll(filters?: { from?: string; to?: string; categoria?: string }): Promise<AdminExpense[]> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return [];

    let query = client
      .from('admin_expenses')
      .select('*, contract:contracts(folio, fecha_evento), supplier:suppliers(nombre)')
      .eq('venue_id', venueId)
      .order('fecha', { ascending: false });

    if (filters?.from)      query = query.gte('fecha', filters.from);
    if (filters?.to)        query = query.lte('fecha', filters.to);
    if (filters?.categoria) query = query.eq('categoria', filters.categoria);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching expenses:', error.message);
      return [];
    }
    return data ?? [];
  }

  async getByContract(contractId: string): Promise<AdminExpense[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('admin_expenses')
      .select('*')
      .eq('contract_id', contractId)
      .order('fecha', { ascending: false });

    if (error) {
      console.error('Error fetching contract expenses:', error.message);
      return [];
    }
    return data ?? [];
  }

  async create(data: CreateExpenseData): Promise<AdminExpense | null> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return null;

    const { data: created, error } = await client
      .from('admin_expenses')
      .insert({ ...data, venue_id: venueId })
      .select()
      .single();

    if (error) {
      console.error('Error creating expense:', error.message);
      return null;
    }
    return created;
  }

  async update(id: string, data: UpdateExpenseData): Promise<AdminExpense | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: updated, error } = await client
      .from('admin_expenses')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating expense:', error.message);
      return null;
    }
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client.from('admin_expenses').delete().eq('id', id);
    if (error) {
      console.error('Error deleting expense:', error.message);
      return false;
    }
    return true;
  }

  async getTotalByPeriod(from: string, to: string): Promise<number> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return 0;

    const { data, error } = await client
      .from('admin_expenses')
      .select('monto')
      .eq('venue_id', venueId)
      .gte('fecha', from)
      .lte('fecha', to);

    if (error || !data) return 0;
    return data.reduce((sum, e) => sum + (e.monto ?? 0), 0);
  }
}
```

- [ ] **Step 3: Reemplazar venue-config.service.ts**

```typescript
import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { VenueService } from './venue.service';
import type { VenueConfig } from '../interfaces/venue-config';

@Injectable({ providedIn: 'root' })
export class VenueConfigService {
  private readonly supabase = inject(SupabaseService);
  private readonly venue    = inject(VenueService);

  async getConfig(): Promise<VenueConfig | null> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return null;

    const { data, error } = await client
      .from('venue_config')
      .select('*')
      .eq('venue_id', venueId)
      .single();

    if (error) {
      console.error('Error fetching venue config:', error.message);
      return null;
    }
    return data as VenueConfig;
  }

  async updateConfig(
    id: string,
    changes: Partial<Pick<VenueConfig,
      | 'max_capacity_per_slot'
      | 'playdate_ticket_price_cents'
      | 'playdate_extra_adult_price_cents'
      | 'min_hours_before_private'
      | 'private_booking_horizon_date'
    >> & { updated_by: string },
  ): Promise<VenueConfig | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('venue_config')
      .update(changes)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating venue config:', error.message);
      return null;
    }
    return data as VenueConfig;
  }
}
```

- [ ] **Step 4: Verificar compilación**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1 | grep -E "(cashier|expense|venue-config)\.service"
```

Esperado: 0 errores

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/cashier.service.ts src/app/core/services/expense.service.ts src/app/core/services/venue-config.service.ts
git commit -m "feat(services): add venue_id filtering to CashierService, ExpenseService, VenueConfigService"
```

---

## Task 6: Actualizar QuoteService + SupplierService + PurchaseService + InventoryService + PosService

**Files:**
- Modify: `src/app/core/services/quote.service.ts`
- Modify: `src/app/core/services/supplier.service.ts`
- Modify: `src/app/core/services/purchase.service.ts`
- Modify: `src/app/core/services/inventory.service.ts`
- Modify: `src/app/core/services/pos.service.ts`

- [ ] **Step 1: Patrón de modificación para cada servicio**

Para cada uno de los 5 servicios restantes, aplicar el mismo patrón:

**Al inicio de la clase:** agregar inyección de VenueService:
```typescript
import { VenueService } from './venue.service';
// ...
private readonly venue = inject(VenueService);
```

**En cada método `getAll()` / `getActive()` / lista equivalente:**
```typescript
const venueId = this.venue.currentVenueId();
if (!client || !venueId) return [];
// agregar .eq('venue_id', venueId) al query builder
```

**En cada método `create()`:**
```typescript
const venueId = this.venue.currentVenueId();
if (!client || !venueId) return null;
// agregar venue_id: venueId al objeto de insert
```

**En `generateFolio()` de PurchaseService** (si existe), agregar `.eq('venue_id', venueId)` al count y pasar `venueId` como parámetro:
```typescript
private async generateFolio(venueId: string): Promise<string> {
  const year = new Date().getFullYear();
  const client = this.supabase.client;
  if (!client) return `OC-${year}-001`;

  const { count } = await client
    .from('purchases')
    .select('*', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .gte('created_at', `${year}-01-01`);

  const num = String((count ?? 0) + 1).padStart(3, '0');
  return `OC-${year}-${num}`;
}
```

**Para PosService** — la sesión de POS se crea con venue_id:
```typescript
// En openSession() o create():
const venueId = this.venue.currentVenueId();
if (!client || !venueId) return null;
// agregar venue_id: venueId al insert de pos_sessions
```

**IMPORTANTE:** Los métodos que consultan por `id` específico (getById, getSession, etc.) NO necesitan filtro de venue_id — la RLS ya lo garantiza en el servidor.

- [ ] **Step 2: Verificar compilación completa**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1
```

Esperado: 0 errores TypeScript

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/quote.service.ts src/app/core/services/supplier.service.ts src/app/core/services/purchase.service.ts src/app/core/services/inventory.service.ts src/app/core/services/pos.service.ts
git commit -m "feat(services): add venue_id filtering to QuoteService, SupplierService, PurchaseService, InventoryService, PosService"
```

---

## Task 7: VenueSwitcher component

**Files:**
- Create: `src/app/features/admin/components/venue-switcher/venue-switcher.ts`
- Create: `src/app/features/admin/components/venue-switcher/venue-switcher.html`

- [ ] **Step 1: Crear venue-switcher.ts**

```typescript
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { ButtonModule } from 'primeng/button';
import { VenueService } from '../../../../core/services/venue.service';

@Component({
  selector: 'app-venue-switcher',
  templateUrl: './venue-switcher.html',
  imports: [OverlayPanelModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VenueSwitcher {
  readonly venue = inject(VenueService);

  selectVenue(id: string, op: { hide: () => void }): void {
    this.venue.switchVenue(id);
    op.hide();
  }
}
```

- [ ] **Step 2: Crear venue-switcher.html**

```html
@if (venue.venues().length > 1) {
  <div class="w-full px-1 mt-1">
    <button
      type="button"
      (click)="overlayPanel.toggle($event)"
      class="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors text-slate-700 text-sm font-medium"
      [attr.aria-label]="'Salón activo: ' + (venue.currentVenue()?.nombre ?? '')"
      aria-haspopup="listbox"
    >
      <i class="pi pi-building text-sm text-slate-500 flex-shrink-0"></i>
      <span class="flex-1 text-left truncate">{{ venue.currentVenue()?.nombre ?? 'Seleccionar salón' }}</span>
      <i class="pi pi-chevron-down text-xs text-slate-400 flex-shrink-0"></i>
    </button>

    <p-overlayPanel #overlayPanel>
      <ul role="listbox" aria-label="Seleccionar salón" class="min-w-[200px] py-1">
        @for (v of venue.venues(); track v.id) {
          <li role="option" [attr.aria-selected]="v.id === venue.currentVenueId()">
            <button
              type="button"
              (click)="selectVenue(v.id, overlayPanel)"
              class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-slate-100 transition-colors"
              [class.font-semibold]="v.id === venue.currentVenueId()"
              [class.text-rojo-brillante]="v.id === venue.currentVenueId()"
            >
              <i
                class="pi pi-check text-xs w-4 flex-shrink-0"
                [class.opacity-0]="v.id !== venue.currentVenueId()"
                aria-hidden="true"
              ></i>
              {{ v.nombre }}
            </button>
          </li>
        }
      </ul>
    </p-overlayPanel>
  </div>
}
```

- [ ] **Step 3: Verificar compilación**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1 | grep venue-switcher
```

Esperado: 0 errores

- [ ] **Step 4: Commit**

```bash
git add src/app/features/admin/components/venue-switcher/
git commit -m "feat(ui): add VenueSwitcher component for admin salon selection"
```

---

## Task 8: AdminVenues page

**Files:**
- Create: `src/app/features/admin/pages/admin-venues/admin-venues.ts`
- Create: `src/app/features/admin/pages/admin-venues/admin-venues.html`

- [ ] **Step 1: Crear admin-venues.ts**

```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService } from '../../../../core/services/auth.service';
import { VenueService } from '../../../../core/services/venue.service';
import type { Venue } from '../../../../core/interfaces/venue';

@Component({
  selector: 'app-admin-venues',
  templateUrl: './admin-venues.html',
  imports: [TableModule, ButtonModule, DialogModule, InputTextModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminVenues {
  readonly venue = inject(VenueService);
  readonly auth  = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly showDialog = signal(false);
  readonly editingId  = signal<string | null>(null);
  readonly saving     = signal(false);

  readonly form = this.fb.group({
    nombre:    ['', Validators.required],
    slug:      ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
    direccion: [''],
    telefono:  [''],
    email:     ['', Validators.email],
  });

  constructor() {
    // venues already loaded by VenueService via effect on auth.currentUser()
  }

  openCreate(): void {
    this.editingId.set(null);
    this.form.reset();
    this.showDialog.set(true);
  }

  openEdit(v: Venue): void {
    this.editingId.set(v.id);
    this.form.setValue({
      nombre:    v.nombre,
      slug:      v.slug,
      direccion: v.direccion ?? '',
      telefono:  v.telefono ?? '',
      email:     v.email ?? '',
    });
    this.showDialog.set(true);
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);

    const raw = this.form.getRawValue() as {
      nombre: string; slug: string; direccion: string; telefono: string; email: string;
    };
    const data = {
      nombre:    raw.nombre,
      slug:      raw.slug,
      direccion: raw.direccion || undefined,
      telefono:  raw.telefono  || undefined,
      email:     raw.email     || undefined,
    };

    const editId = this.editingId();
    if (editId) {
      await this.venue.updateVenue(editId, data);
    } else {
      await this.venue.createVenue(data);
    }

    this.saving.set(false);
    this.showDialog.set(false);
  }

  async toggleActivo(v: Venue): Promise<void> {
    await this.venue.updateVenue(v.id, { activo: !v.activo });
  }
}
```

- [ ] **Step 2: Crear admin-venues.html**

```html
<div class="p-6 max-w-5xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-slate-900">Salones / Sucursales</h1>
      <p class="text-slate-500 text-sm mt-1">Gestiona las ubicaciones de tu negocio</p>
    </div>
    @if (auth.isOwner()) {
      <button
        pButton
        type="button"
        label="Nuevo salón"
        icon="pi pi-plus"
        (click)="openCreate()"
        class="p-button-sm"
      ></button>
    }
  </div>

  <p-table
    [value]="venue.venues()"
    [loading]="venue.loading()"
    styleClass="p-datatable-sm"
    [tableStyle]="{ 'min-width': '40rem' }"
  >
    <ng-template #header>
      <tr>
        <th>Nombre</th>
        <th>Slug</th>
        <th>Dirección</th>
        <th>Estado</th>
        @if (auth.isOwner()) { <th>Acciones</th> }
      </tr>
    </ng-template>

    <ng-template #body let-v>
      <tr>
        <td class="font-medium">{{ v.nombre }}</td>
        <td class="text-slate-500 text-sm font-mono">{{ v.slug }}</td>
        <td class="text-slate-500 text-sm">{{ v.direccion ?? '—' }}</td>
        <td>
          <span
            class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
            [class]="v.activo
              ? 'bg-green-100 text-green-700'
              : 'bg-slate-100 text-slate-500'"
          >
            {{ v.activo ? 'Activo' : 'Inactivo' }}
          </span>
        </td>
        @if (auth.isOwner()) {
          <td>
            <div class="flex gap-1">
              <button
                pButton
                type="button"
                icon="pi pi-pencil"
                class="p-button-text p-button-sm"
                (click)="openEdit(v)"
                aria-label="Editar salón"
              ></button>
              <button
                pButton
                type="button"
                [icon]="v.activo ? 'pi pi-eye-slash' : 'pi pi-eye'"
                class="p-button-text p-button-sm"
                (click)="toggleActivo(v)"
                [attr.aria-label]="v.activo ? 'Desactivar salón' : 'Activar salón'"
              ></button>
            </div>
          </td>
        }
      </tr>
    </ng-template>

    <ng-template #emptymessage>
      <tr>
        <td [attr.colspan]="auth.isOwner() ? 5 : 4" class="text-center text-slate-400 py-10">
          No hay salones registrados
        </td>
      </tr>
    </ng-template>
  </p-table>
</div>

<p-dialog
  [(visible)]="showDialog"
  [header]="editingId() ? 'Editar salón' : 'Nuevo salón'"
  [modal]="true"
  [style]="{ width: '480px' }"
  [draggable]="false"
>
  <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4 pt-2">
    <div class="flex flex-col gap-1">
      <label for="v-nombre" class="text-sm font-medium text-slate-700">Nombre *</label>
      <input pInputText id="v-nombre" formControlName="nombre" placeholder="Ej: Salón Norte" />
    </div>
    <div class="flex flex-col gap-1">
      <label for="v-slug" class="text-sm font-medium text-slate-700">Slug (URL) *</label>
      <input pInputText id="v-slug" formControlName="slug" placeholder="salon-norte" />
      <span class="text-xs text-slate-400">Solo minúsculas, números y guiones. Ej: salon-norte</span>
    </div>
    <div class="flex flex-col gap-1">
      <label for="v-dir" class="text-sm font-medium text-slate-700">Dirección</label>
      <input pInputText id="v-dir" formControlName="direccion" placeholder="Av. Principal 123" />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div class="flex flex-col gap-1">
        <label for="v-tel" class="text-sm font-medium text-slate-700">Teléfono</label>
        <input pInputText id="v-tel" formControlName="telefono" placeholder="+52 55 0000 0000" />
      </div>
      <div class="flex flex-col gap-1">
        <label for="v-email" class="text-sm font-medium text-slate-700">Email</label>
        <input pInputText id="v-email" formControlName="email" type="email" placeholder="salon@ejemplo.com" />
      </div>
    </div>
    <div class="flex justify-end gap-2 pt-2">
      <button
        pButton type="button" label="Cancelar" class="p-button-text"
        (click)="showDialog.set(false)"
      ></button>
      <button
        pButton type="submit" label="Guardar"
        [loading]="saving()" [disabled]="form.invalid"
      ></button>
    </div>
  </form>
</p-dialog>
```

- [ ] **Step 3: Verificar compilación**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1 | grep admin-venues
```

Esperado: 0 errores

- [ ] **Step 4: Commit**

```bash
git add src/app/features/admin/pages/admin-venues/
git commit -m "feat(admin): add AdminVenues page for salon CRUD management"
```

---

## Task 9: Integrar VenueSwitcher en AdminLayout + ruta /salones

**Files:**
- Modify: `src/app/features/admin/pages/admin-layout/admin-layout.ts`
- Modify: `src/app/features/admin/pages/admin-layout/admin-layout.html`
- Modify: `src/app/features/admin/admin.routes.ts`

- [ ] **Step 1: Actualizar admin-layout.ts**

Agregar al bloque de imports de TypeScript en la parte superior:
```typescript
import { VenueSwitcher } from '../../components/venue-switcher/venue-switcher';
import { VenueService } from '../../../../core/services/venue.service';
```

Agregar `VenueSwitcher` al array `imports` del decorador `@Component`.

Agregar señal del venue service en el cuerpo de la clase (después de `readonly canManage`):
```typescript
readonly venue = inject(VenueService);
```

Agregar al final del array `navSections` una nueva sección de administración:
```typescript
{
  label: 'Administración',
  items: [
    { label: 'Salones', route: 'salones', icon: 'pi-building' },
  ],
},
```

- [ ] **Step 2: Actualizar admin-layout.html — VenueSwitcher**

En el template del **mobile drawer** (dentro del `<p-drawer>`), localizar el bloque del header con el logo/brand:
```html
<div class="flex items-center gap-2">
  <div class="w-8 h-8 rounded-lg bg-rojo-brillante ...">
```

Agregar `<app-venue-switcher>` inmediatamente después de ese `div`, antes del `<nav>`:
```html
<app-venue-switcher></app-venue-switcher>
```

En la **sidebar desktop** (si existe en el template), agregar el mismo elemento en la misma posición relativa (debajo del brand, encima del nav).

- [ ] **Step 3: Ocultar sección "Administración" para no-owners**

En la sección del nav que itera `navSections`, envolver condicionalmente la sección "Administración":

```html
@for (section of navSections; track section.label) {
  @if (section.label !== 'Administración' || auth.isOwner()) {
    <div class="mb-4">
      <!-- contenido existente del section sin cambios -->
    </div>
  }
}
```

Aplicar este cambio en **ambas** navegaciones: mobile drawer y sidebar desktop.

- [ ] **Step 4: Agregar ruta /salones en admin.routes.ts**

En `src/app/features/admin/admin.routes.ts`, dentro del array `children`, agregar antes del cierre `]`:

```typescript
{
  path: 'salones',
  loadComponent: () =>
    import('./pages/admin-venues/admin-venues').then((m) => m.AdminVenues),
},
```

- [ ] **Step 5: Verificar compilación completa**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1
```

Esperado: **0 errores**

- [ ] **Step 6: Commit**

```bash
git add src/app/features/admin/pages/admin-layout/ src/app/features/admin/admin.routes.ts
git commit -m "feat(admin): integrate VenueSwitcher in layout, add /salones route for owner management"
```

---

## Task 10: Build final + verificación

**Files:** Solo verificación, sin cambios de código.

- [ ] **Step 1: Build de producción**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | tail -20
```

Esperado: build exitoso sin errores.

- [ ] **Step 2: Verificar datos en Supabase**

```bash
npx supabase db remote query "SELECT id, nombre, slug FROM venues;"
```

Esperado: 1 fila con 'Salón Principal'.

```bash
npx supabase db remote query "SELECT COUNT(*) as total FROM venue_users;"
```

Esperado: número igual a los usuarios existentes en `profiles`.

- [ ] **Step 3: Verificar RLS con función helper**

```bash
npx supabase db remote query "SELECT routine_name FROM information_schema.routines WHERE routine_name = 'user_venue_ids' AND routine_schema = 'public';"
```

Esperado: `user_venue_ids` aparece en el resultado.

- [ ] **Step 4: Commit final del plan**

```bash
git add docs/superpowers/plans/2026-05-23-multi-salon-phase1.md
git commit -m "docs: add multi-salon Phase 1 implementation plan"
```
