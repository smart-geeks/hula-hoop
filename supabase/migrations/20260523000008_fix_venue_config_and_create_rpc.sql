-- ==============================================================================
-- Migration: 20260523000008_fix_venue_config_and_create_rpc.sql
--
-- 1. Insertar venue_config para MONTERREY (faltaba, causaba "No se encontró")
-- 2. Actualizar create_venue RPC para auto-crear venue_config en nuevos venues
-- ==============================================================================

-- ── 1. venue_config para MONTERREY ───────────────────────────────────────────
INSERT INTO venue_config (
  venue_id,
  max_capacity_per_slot,
  playdate_ticket_price_cents,
  playdate_extra_adult_price_cents,
  min_hours_before_private,
  private_booking_horizon_date,
  updated_by
)
SELECT
  '7c6f595a-fb53-4e61-971a-deed63b28ec5'::uuid,
  max_capacity_per_slot,
  playdate_ticket_price_cents,
  playdate_extra_adult_price_cents,
  min_hours_before_private,
  NULL,
  NULL
FROM venue_config
WHERE venue_id = '00000000-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;

-- ── 2. Actualizar create_venue para auto-crear venue_config ──────────────────
CREATE OR REPLACE FUNCTION create_venue(
  p_nombre    TEXT,
  p_slug      TEXT,
  p_direccion TEXT DEFAULT NULL,
  p_telefono  TEXT DEFAULT NULL,
  p_email     TEXT DEFAULT NULL,
  p_logo_url  TEXT DEFAULT NULL
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

  -- Crear el venue
  INSERT INTO venues (nombre, slug, direccion, telefono, email, logo_url)
  VALUES (p_nombre, p_slug, p_direccion, p_telefono, p_email, p_logo_url)
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

COMMENT ON FUNCTION create_venue IS
  'Crea un venue, asigna al creador como owner, y genera venue_config con defaults. '
  'SECURITY DEFINER: bypasea RLS para los INSERTs iniciales.';

GRANT EXECUTE ON FUNCTION create_venue(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
