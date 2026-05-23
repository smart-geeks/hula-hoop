-- ==============================================================================
-- Migration: 20260523000003_categories_system.sql
-- Sistema de categorías con color para Inventario/POS, Gastos y Proveedores.
--
-- Diseño:
--   - Una sola tabla `categories` con discriminador `tipo`
--   - El campo `color` es hex (#RRGGBB) — se usa en pills del POS, badges, etc.
--   - Seed con las categorías existentes (mapeadas desde las constantes TS)
--   - Las tablas existentes (inventory_items, admin_expenses, suppliers) siguen
--     usando TEXT libre — categories es la fuente de color y orden, no FK.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo       TEXT        NOT NULL CHECK (tipo IN ('producto', 'gasto', 'proveedor')),
  nombre     TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#9ca3af',
  icono      TEXT,
  orden      INT         NOT NULL DEFAULT 0,
  activo     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tipo, nombre)
);

COMMENT ON TABLE  categories       IS 'Categorías con color para POS/Inventario, Gastos y Proveedores.';
COMMENT ON COLUMN categories.color IS 'Color hex (#RRGGBB) para pills y badges en la interfaz.';
COMMENT ON COLUMN categories.tipo  IS 'producto | gasto | proveedor';

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_auth" ON categories;
CREATE POLICY "categories_auth"
  ON categories FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

CREATE INDEX IF NOT EXISTS idx_categories_tipo_activo ON categories (tipo, activo);


-- ── Seed: Categorías de PRODUCTOS (Inventario / POS) ─────────────────────────
INSERT INTO categories (tipo, nombre, color, icono, orden) VALUES
  ('producto', 'Bebidas',      '#3b82f6', 'pi pi-shopping-bag',  1),
  ('producto', 'Alimentos',    '#f97316', 'pi pi-shopping-bag',  2),
  ('producto', 'Decoración',   '#a855f7', 'pi pi-star',          3),
  ('producto', 'Papelería',    '#22c55e', 'pi pi-file',          4),
  ('producto', 'Limpieza',     '#06b6d4', 'pi pi-sparkles',      5),
  ('producto', 'Utilería',     '#f59e0b', 'pi pi-box',           6),
  ('producto', 'Electrónicos', '#6366f1', 'pi pi-bolt',          7),
  ('producto', 'Otro',         '#9ca3af', 'pi pi-tag',           8)
ON CONFLICT (tipo, nombre) DO NOTHING;


-- ── Seed: Categorías de GASTOS ────────────────────────────────────────────────
INSERT INTO categories (tipo, nombre, color, icono, orden) VALUES
  ('gasto', 'Nómina',                      '#10b981', 'pi pi-users',      1),
  ('gasto', 'Renta local',                 '#64748b', 'pi pi-building',   2),
  ('gasto', 'Servicios (luz/agua/internet)','#eab308', 'pi pi-bolt',       3),
  ('gasto', 'Mantenimiento',               '#f97316', 'pi pi-wrench',     4),
  ('gasto', 'Marketing y publicidad',      '#ec4899', 'pi pi-megaphone',  5),
  ('gasto', 'Seguros',                     '#3b82f6', 'pi pi-shield',     6),
  ('gasto', 'Impuestos',                   '#ef4444', 'pi pi-receipt',    7),
  ('gasto', 'Papelería y oficina',         '#22c55e', 'pi pi-file',       8),
  ('gasto', 'Transporte',                  '#06b6d4', 'pi pi-car',        9),
  ('gasto', 'Capacitación',               '#7c3aed', 'pi pi-graduation-cap', 10),
  ('gasto', 'Otro',                        '#9ca3af', 'pi pi-tag',        11)
ON CONFLICT (tipo, nombre) DO NOTHING;


-- ── Seed: Categorías de PROVEEDORES ──────────────────────────────────────────
INSERT INTO categories (tipo, nombre, color, icono, orden) VALUES
  ('proveedor', 'Catering',         '#f97316', 'pi pi-shopping-bag',  1),
  ('proveedor', 'Decoración',       '#a855f7', 'pi pi-star',          2),
  ('proveedor', 'Audio y Video',    '#6366f1', 'pi pi-volume-up',     3),
  ('proveedor', 'Fotografía',       '#ec4899', 'pi pi-camera',        4),
  ('proveedor', 'Entretenimiento',  '#f59e0b', 'pi pi-face-smile',    5),
  ('proveedor', 'Mobiliario',       '#64748b', 'pi pi-table',         6),
  ('proveedor', 'Limpieza',         '#06b6d4', 'pi pi-sparkles',      7),
  ('proveedor', 'Seguridad',        '#ef4444', 'pi pi-shield',        8),
  ('proveedor', 'Flores',           '#22c55e', 'pi pi-heart',         9),
  ('proveedor', 'Pasteles',         '#e879f9', 'pi pi-star-fill',     10),
  ('proveedor', 'Otro',             '#9ca3af', 'pi pi-tag',           11)
ON CONFLICT (tipo, nombre) DO NOTHING;
