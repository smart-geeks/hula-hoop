-- ============================================================
-- MIGRACIÓN: Plataforma de Gestión de Eventos
-- Branch: hula-hoop-dev  |  Fecha: 2026-05-20
-- Solo tablas NUEVAS — producción intacta
-- ============================================================

-- ── TIPOS ENUM (idempotente via DO block) ───────────────────
DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('borrador','enviada','aprobada','rechazada','vencida');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contract_status AS ENUM ('borrador','firmado','liquidado','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE purchase_status AS ENUM ('pendiente','recibida','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE movement_type AS ENUM ('entrada','salida','ajuste');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('pendiente','en_progreso','completado','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CLIENTES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  telefono    TEXT,
  email       TEXT,
  rfc         TEXT,
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients_auth" ON clients;
CREATE POLICY "clients_auth" ON clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── COTIZACIONES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio        TEXT UNIQUE NOT NULL,
  client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_evento DATE,
  estado       quote_status DEFAULT 'borrador',
  subtotal     NUMERIC(12,2) DEFAULT 0,
  descuento    NUMERIC(12,2) DEFAULT 0,
  total        NUMERIC(12,2) DEFAULT 0,
  notas        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS quote_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id         UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  descripcion      TEXT NOT NULL,
  cantidad         NUMERIC(10,2) DEFAULT 1,
  precio_unitario  NUMERIC(12,2) DEFAULT 0,
  subtotal         NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quotes_auth" ON quotes;
DROP POLICY IF EXISTS "quote_items_auth" ON quote_items;
CREATE POLICY "quotes_auth" ON quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "quote_items_auth" ON quote_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── CONTRATOS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio             TEXT UNIQUE NOT NULL,
  quote_id          UUID REFERENCES quotes(id) ON DELETE SET NULL,
  client_id         UUID REFERENCES clients(id) ON DELETE SET NULL,
  fecha_firma       DATE,
  fecha_evento      DATE NOT NULL,
  hora_inicio       TIME,
  hora_fin          TIME,
  salon_renta       NUMERIC(12,2) DEFAULT 0,
  total_contrato    NUMERIC(12,2) DEFAULT 0,
  deposito_pagado   NUMERIC(12,2) DEFAULT 0,
  saldo_pendiente   NUMERIC(12,2) GENERATED ALWAYS AS (total_contrato - deposito_pagado) STORED,
  estado            contract_status DEFAULT 'borrador',
  pdf_url           TEXT,
  notas             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS contract_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  monto        NUMERIC(12,2) NOT NULL,
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  metodo       TEXT DEFAULT 'efectivo',
  notas        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contracts_auth" ON contracts;
DROP POLICY IF EXISTS "contract_payments_auth" ON contract_payments;
CREATE POLICY "contracts_auth" ON contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "contract_payments_auth" ON contract_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Vincular reservaciones existentes con contratos (nullable — no rompe nada)
ALTER TABLE IF EXISTS private_reservations
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL;

-- ── PROVEEDORES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  categoria   TEXT,
  contacto    TEXT,
  telefono    TEXT,
  email       TEXT,
  notas       TEXT,
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers_auth" ON suppliers;
CREATE POLICY "suppliers_auth" ON suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── COMPRAS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio        TEXT UNIQUE NOT NULL,
  supplier_id  UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  contract_id  UUID REFERENCES contracts(id) ON DELETE SET NULL,
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  total        NUMERIC(12,2) DEFAULT 0,
  estado       purchase_status DEFAULT 'pendiente',
  notas        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS purchase_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id      UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  descripcion      TEXT NOT NULL,
  cantidad         NUMERIC(10,2) DEFAULT 1,
  precio_unitario  NUMERIC(12,2) DEFAULT 0,
  subtotal         NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchases_auth" ON purchases;
DROP POLICY IF EXISTS "purchase_items_auth" ON purchase_items;
CREATE POLICY "purchases_auth" ON purchases FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "purchase_items_auth" ON purchase_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── INVENTARIO ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL,
  sku           TEXT UNIQUE,
  categoria     TEXT,
  unidad        TEXT DEFAULT 'pieza',
  stock_actual  NUMERIC(10,2) DEFAULT 0,
  stock_minimo  NUMERIC(10,2) DEFAULT 0,
  precio_costo  NUMERIC(12,2) DEFAULT 0,
  precio_venta  NUMERIC(12,2) DEFAULT 0,
  activo        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS inventory_movements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  tipo         movement_type NOT NULL,
  cantidad     NUMERIC(10,2) NOT NULL,
  motivo       TEXT,
  contract_id  UUID REFERENCES contracts(id) ON DELETE SET NULL,
  purchase_id  UUID REFERENCES purchases(id) ON DELETE SET NULL,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_items_auth" ON inventory_items;
DROP POLICY IF EXISTS "inventory_movements_auth" ON inventory_movements;
CREATE POLICY "inventory_items_auth" ON inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inventory_movements_auth" ON inventory_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger: stock se actualiza automáticamente con cada movimiento
CREATE OR REPLACE FUNCTION update_stock_on_movement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.tipo = 'entrada' THEN
    UPDATE inventory_items SET stock_actual = stock_actual + NEW.cantidad WHERE id = NEW.item_id;
  ELSIF NEW.tipo = 'salida' THEN
    UPDATE inventory_items SET stock_actual = stock_actual - NEW.cantidad WHERE id = NEW.item_id;
  ELSIF NEW.tipo = 'ajuste' THEN
    UPDATE inventory_items SET stock_actual = NEW.cantidad WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_update_stock ON inventory_movements;
CREATE TRIGGER trg_update_stock
  AFTER INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION update_stock_on_movement();

-- ── PUNTO DE VENTA ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   UUID REFERENCES contracts(id) ON DELETE SET NULL,
  opened_at     TIMESTAMPTZ DEFAULT NOW(),
  closed_at     TIMESTAMPTZ,
  total_ventas  NUMERIC(12,2) DEFAULT 0,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS pos_sales (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES pos_sessions(id) ON DELETE CASCADE,
  folio       TEXT NOT NULL,
  total       NUMERIC(12,2) DEFAULT 0,
  pagado_con  TEXT DEFAULT 'efectivo',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pos_sale_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          UUID NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  item_id          UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  cantidad         NUMERIC(10,2) NOT NULL,
  precio_unitario  NUMERIC(12,2) NOT NULL,
  subtotal         NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);
ALTER TABLE pos_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sale_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pos_sessions_auth" ON pos_sessions;
DROP POLICY IF EXISTS "pos_sales_auth" ON pos_sales;
DROP POLICY IF EXISTS "pos_sale_items_auth" ON pos_sale_items;
CREATE POLICY "pos_sessions_auth" ON pos_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pos_sales_auth" ON pos_sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pos_sale_items_auth" ON pos_sale_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── GASTOS ADMINISTRATIVOS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria        TEXT NOT NULL,
  descripcion      TEXT NOT NULL,
  monto            NUMERIC(12,2) NOT NULL,
  fecha            DATE NOT NULL DEFAULT CURRENT_DATE,
  comprobante_url  TEXT,
  contract_id      UUID REFERENCES contracts(id) ON DELETE SET NULL,
  supplier_id      UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE admin_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_expenses_auth" ON admin_expenses;
CREATE POLICY "admin_expenses_auth" ON admin_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── ACTIVIDADES DEL STAFF ───────────────────────────────────
CREATE TABLE IF NOT EXISTS event_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  titulo       TEXT NOT NULL,
  descripcion  TEXT,
  asignado_a   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  hora_inicio  TIMESTAMPTZ,
  hora_fin     TIMESTAMPTZ,
  estado       task_status DEFAULT 'pendiente',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE event_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "event_tasks_managers" ON event_tasks;
DROP POLICY IF EXISTS "event_tasks_staff_select" ON event_tasks;
DROP POLICY IF EXISTS "event_tasks_staff_update" ON event_tasks;
CREATE POLICY "event_tasks_managers" ON event_tasks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('owner','admin')))
  WITH CHECK (true);
CREATE POLICY "event_tasks_staff_select" ON event_tasks FOR SELECT TO authenticated
  USING (asignado_a = auth.uid());
CREATE POLICY "event_tasks_staff_update" ON event_tasks FOR UPDATE TO authenticated
  USING (asignado_a = auth.uid()) WITH CHECK (asignado_a = auth.uid());

-- ── VISTA P&L POR EVENTO ────────────────────────────────────
CREATE OR REPLACE VIEW event_profit_loss AS
SELECT
  c.id                                                               AS contract_id,
  c.folio,
  c.fecha_evento,
  c.estado,
  cl.nombre                                                          AS cliente,
  c.salon_renta,
  COALESCE((SELECT SUM(qi.subtotal) FROM quote_items qi WHERE qi.quote_id = c.quote_id), 0) AS extras_cotizados,
  COALESCE((
    SELECT SUM(ps.total) FROM pos_sessions sess
    JOIN pos_sales ps ON ps.session_id = sess.id WHERE sess.contract_id = c.id
  ), 0)                                                              AS ventas_pos,
  c.salon_renta
    + COALESCE((SELECT SUM(qi.subtotal) FROM quote_items qi WHERE qi.quote_id = c.quote_id), 0)
    + COALESCE((SELECT SUM(ps.total) FROM pos_sessions sess JOIN pos_sales ps ON ps.session_id = sess.id WHERE sess.contract_id = c.id), 0)
                                                                     AS total_ingresos,
  COALESCE((SELECT SUM(p.total) FROM purchases p WHERE p.contract_id = c.id), 0)            AS compras_evento,
  COALESCE((
    SELECT SUM(ABS(im.cantidad) * ii.precio_costo)
    FROM inventory_movements im JOIN inventory_items ii ON ii.id = im.item_id
    WHERE im.contract_id = c.id AND im.tipo = 'salida'
  ), 0)                                                              AS consumo_inventario,
  COALESCE((SELECT SUM(ae.monto) FROM admin_expenses ae WHERE ae.contract_id = c.id), 0)   AS gastos_directos,
  c.deposito_pagado,
  c.saldo_pendiente,
  c.total_contrato
FROM contracts c
LEFT JOIN clients cl ON cl.id = c.client_id;

-- ── ÍNDICES ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_quotes_client_id          ON quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_estado             ON quotes(estado);
CREATE INDEX IF NOT EXISTS idx_contracts_client_id       ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_fecha_evento    ON contracts(fecha_evento);
CREATE INDEX IF NOT EXISTS idx_contracts_estado          ON contracts(estado);
CREATE INDEX IF NOT EXISTS idx_purchases_contract_id     ON purchases(contract_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id     ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_item_id     ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_contract_id ON inventory_movements(contract_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_contract_id  ON pos_sessions(contract_id);
CREATE INDEX IF NOT EXISTS idx_admin_expenses_contract   ON admin_expenses(contract_id);
CREATE INDEX IF NOT EXISTS idx_admin_expenses_fecha      ON admin_expenses(fecha);
CREATE INDEX IF NOT EXISTS idx_event_tasks_contract_id   ON event_tasks(contract_id);
CREATE INDEX IF NOT EXISTS idx_event_tasks_asignado_a    ON event_tasks(asignado_a);
