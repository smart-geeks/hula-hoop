-- ─────────────────────────────────────────────────────────────────────────────
-- Landing Multi-Venue: Phase 1 + CMS
-- Adds venue_id to public catalog tables and creates RLS policies for
-- anonymous + authenticated landing visitors. Also creates the CMS table
-- venue_landing_sections for per-venue content customization.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Agregar venue_id a las 3 tablas de la landing ─────────────────────────
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
ALTER TABLE restaurant_items
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
ALTER TABLE gallery_images
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;

-- ── 2. Backfill: asignar al Salón Principal (UUID fijo del seed existente) ────
UPDATE packages         SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
UPDATE restaurant_items SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
UPDATE gallery_images   SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;

-- ── 3. Aplicar NOT NULL tras el backfill ─────────────────────────────────────
ALTER TABLE packages        ALTER COLUMN venue_id SET NOT NULL;
ALTER TABLE restaurant_items ALTER COLUMN venue_id SET NOT NULL;
ALTER TABLE gallery_images   ALTER COLUMN venue_id SET NOT NULL;

-- ── 4. Índices de rendimiento ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_packages_venue_id         ON packages(venue_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_items_venue_id ON restaurant_items(venue_id);
CREATE INDEX IF NOT EXISTS idx_gallery_images_venue_id   ON gallery_images(venue_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES — Lectura pública del catálogo de la landing
--
-- Por qué TO anon, authenticated:
--   Cuando un cliente inicia sesión (/mi-cuenta/reservas o pago), el cliente
--   Supabase JS adjunta el JWT en TODAS las peticiones siguientes. PostgreSQL
--   eleva el rol de 'anon' a 'authenticated'. Con TO anon únicamente, el
--   cliente logueado vería la landing en blanco (0 paquetes, 0 precios, 0
--   galería). Los datos del catálogo son públicos; el RBAC del admin sigue
--   protegido por políticas separadas sobre contracts, pos_sessions, etc.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── venues: lectura pública de venues activos ─────────────────────────────────
-- "venues_select" existente (authenticated → solo sus venues para el admin) se conserva.
-- Esta política adicional permite que la landing liste sucursales sin restricción.
CREATE POLICY "venues_public_read" ON venues
  FOR SELECT TO anon, authenticated
  USING (activo = true);

-- ── venue_config: precios y aforo necesarios para la landing ──────────────────
CREATE POLICY "venue_config_public_read" ON venue_config
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── packages: paquetes activos por venue ──────────────────────────────────────
CREATE POLICY "packages_public_read" ON packages
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- ── restaurant_items: menú activo por venue ───────────────────────────────────
CREATE POLICY "restaurant_items_public_read" ON restaurant_items
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- ── gallery_images: imágenes activas por venue ────────────────────────────────
CREATE POLICY "gallery_images_public_read" ON gallery_images
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- ─────────────────────────────────────────────────────────────────────────────
-- CMS: venue_landing_sections
-- Tabla JSONB para personalizar textos e imágenes por sucursal sin tocar código.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_landing_sections (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     UUID        NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  section_key  TEXT        NOT NULL,
  -- Valores: 'hero' | 'polaroid' | 'private_events' | 'play_day' | 'footer'
  title        TEXT,
  subtitle     TEXT,
  content_json JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (venue_id, section_key)
);

ALTER TABLE venue_landing_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "landing_sections_public_read" ON venue_landing_sections
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_landing_sections_venue_section
  ON venue_landing_sections(venue_id, section_key);
