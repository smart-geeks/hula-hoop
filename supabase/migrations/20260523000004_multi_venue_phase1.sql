-- ==============================================================================
-- Migration: 20260523000004_multi_venue_phase1.sql
-- Multi-salón Phase 1: venues, venue_users, venue_id en 12 tablas raíz, RLS
--
-- REGLA: No rompe lógica de negocio. Solo agrega la dimensión venue_id.
-- Todos los datos existentes se asignan al salón por defecto (UUID fijo).
-- Patrón seguro: ADD COLUMN nullable → UPDATE masivo → SET NOT NULL
--
-- ORDEN DE DEPENDENCIAS:
--   1. venues (tabla base, sin políticas aún)
--   2. venue_users (referencia venues)
--   3. user_venue_ids() (referencia venue_users)
--   4. Políticas de venues y venue_users (usan el helper)
--   5. Datos semilla
--   6. venue_id en 12 tablas + índices
--   7. RLS en 12 tablas
--   8. RPC create_cashier y vistas
-- ==============================================================================

-- ── PARTE 1: Tabla venues (sin políticas aún) ─────────────────────────────────
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

-- ── PARTE 2: Tabla venue_users (sin políticas aún) ────────────────────────────
CREATE TABLE IF NOT EXISTS venue_users (
  venue_id   UUID NOT NULL REFERENCES venues(id)     ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'staff'
               CHECK (role IN ('owner','admin','staff','readonly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (venue_id, user_id)
);

ALTER TABLE venue_users ENABLE ROW LEVEL SECURITY;

-- ── PARTE 3: Función RLS helper ───────────────────────────────────────────────
-- SECURITY DEFINER + STABLE: el planner cachéa el resultado por transacción.
-- Evita subquery O(n) por cada fila escaneada en las políticas.
-- Debe crearse DESPUÉS de venue_users para que compile sin error.
CREATE OR REPLACE FUNCTION user_venue_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT ARRAY(SELECT venue_id FROM venue_users WHERE user_id = auth.uid());
$$;

-- ── PARTE 4: Políticas de venues ──────────────────────────────────────────────
DROP POLICY IF EXISTS "venues_select"  ON venues;
DROP POLICY IF EXISTS "venues_manage"  ON venues;

CREATE POLICY "venues_select" ON venues
  FOR SELECT TO authenticated
  USING (id = ANY(user_venue_ids()));

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

-- ── PARTE 5: Políticas de venue_users ────────────────────────────────────────
DROP POLICY IF EXISTS "venue_users_self_select"       ON venue_users;
DROP POLICY IF EXISTS "venue_users_managers_select"   ON venue_users;
DROP POLICY IF EXISTS "venue_users_owners_manage"     ON venue_users;

CREATE POLICY "venue_users_self_select" ON venue_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

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

-- ── PARTE 6: Datos semilla ────────────────────────────────────────────────────
INSERT INTO venues (id, nombre, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Salón Principal', 'salon-principal')
ON CONFLICT (id) DO NOTHING;

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

-- ── PARTE 7: venue_id en las 12 tablas raíz ──────────────────────────────────

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

-- inventory_items
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

-- ── PARTE 8: Índices en venue_id ──────────────────────────────────────────────
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

-- ── PARTE 9: RLS actualizada en las 12 tablas ─────────────────────────────────

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

-- ── PARTE 10: RPC create_cashier actualizada ──────────────────────────────────
-- Eliminar la versión anterior de 2 argumentos para evitar ambigüedad en COMMENT.
DROP FUNCTION IF EXISTS create_cashier(TEXT, TEXT);

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

COMMENT ON FUNCTION create_cashier(TEXT, TEXT, UUID) IS
  'Crea un cajero con PIN hasheado (bcrypt cost=8) asignado al venue dado. '
  'SECURITY DEFINER: el hash nunca regresa al cliente.';

-- ── PARTE 11: Vistas actualizadas con venue_id ───────────────────────────────
-- DROP primero para poder cambiar la lista de columnas (venue_id es nueva).
DROP VIEW IF EXISTS pos_sales_detail;

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

DROP VIEW IF EXISTS event_profit_loss;
CREATE VIEW event_profit_loss AS
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
