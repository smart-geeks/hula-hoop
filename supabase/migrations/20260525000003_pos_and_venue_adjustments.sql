-- ==============================================================================
-- Migration: 20260525000003_pos_and_venue_adjustments.sql
--
-- 1. Agregar campos de contacto y horarios dinámicos a la tabla de venues.
-- 2. Actualizar el RPC create_venue con la firma ampliada.
-- 3. Incorporar venue_id a extras con retrocompatibilidad.
-- 4. Extender pos_sale_items para admitir restaurante y extras.
-- ==============================================================================

-- ── 1. Campos de contacto extendidos en venues ────────────────────────────────
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS horarios TEXT,
  ADD COLUMN IF NOT EXISTS google_maps_link TEXT;

-- ── 2. Actualizar create_venue RPC con firma ampliada ──────────────────────────
-- Eliminar la firma anterior (6 params) antes de crear la nueva (9 params)
-- para evitar ambigüedad en COMMENT / GRANT que usan solo el nombre.
DROP FUNCTION IF EXISTS create_venue(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_venue(
  p_nombre             TEXT,
  p_slug               TEXT,
  p_direccion          TEXT DEFAULT NULL,
  p_telefono           TEXT DEFAULT NULL,
  p_email              TEXT DEFAULT NULL,
  p_logo_url           TEXT DEFAULT NULL,
  p_whatsapp           TEXT DEFAULT NULL,
  p_horarios           TEXT DEFAULT NULL,
  p_google_maps_link   TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id  UUID;
  v_user_id   UUID := auth.uid();
  v_ref_cfg   venue_config%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Crear el venue con todos los campos extendidos
  INSERT INTO venues (
    nombre, slug, direccion, telefono, email, logo_url,
    whatsapp, horarios, google_maps_link
  )
  VALUES (
    p_nombre, p_slug, p_direccion, p_telefono, p_email, p_logo_url,
    p_whatsapp, p_horarios, p_google_maps_link
  )
  RETURNING id INTO v_venue_id;

  -- Asignar al creador como owner
  INSERT INTO venue_users (venue_id, user_id, role)
  VALUES (v_venue_id, v_user_id, 'owner');

  -- Tomar valores de referencia del primer venue_config existente (si hay)
  SELECT * INTO v_ref_cfg FROM venue_config LIMIT 1;

  -- Crear venue_config con valores de referencia o defaults razonables
  INSERT INTO venue_config (
    venue_id,
    max_capacity_per_slot,
    playdate_ticket_price_cents,
    playdate_extra_adult_price_cents,
    min_hours_before_private,
    private_booking_horizon_date,
    updated_by
  ) VALUES (
    v_venue_id,
    COALESCE(v_ref_cfg.max_capacity_per_slot,              20),
    COALESCE(v_ref_cfg.playdate_ticket_price_cents,     15000),
    COALESCE(v_ref_cfg.playdate_extra_adult_price_cents, 5000),
    COALESCE(v_ref_cfg.min_hours_before_private,            24),
    NULL,
    NULL
  );

  RETURN v_venue_id;
END;
$$;

-- Usar la firma completa para evitar ambigüedad (la función de 6 params ya fue eliminada arriba)
COMMENT ON FUNCTION create_venue(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Crea un venue con campos dinámicos de contacto, asigna al creador como owner, y genera venue_config.';

GRANT EXECUTE ON FUNCTION create_venue(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ── 3. Incorporar venue_id a extras con retrocompatibilidad ─────────────────
ALTER TABLE extras ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;

-- Asignar los extras existentes al salón principal
UPDATE extras SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;

-- Establecer restricción NOT NULL
ALTER TABLE extras ALTER COLUMN venue_id SET NOT NULL;

-- Agregar índice de rendimiento para filtros por sucursal
CREATE INDEX IF NOT EXISTS idx_extras_venue_id ON extras(venue_id);

-- ── 4. Extender pos_sale_items para admitir restaurante y extras ────────────────
ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS restaurant_item_id UUID REFERENCES restaurant_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS extra_id UUID REFERENCES extras(id) ON DELETE SET NULL;
