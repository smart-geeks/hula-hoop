-- =============================================================================
-- Migration: 20260622200001_quote_first_unified_flow.sql
--
-- Quote-First Unified Flow — Phase 1: Database
--   1. Add new columns to quotes table
--   2. Replace fn_check_slot_conflict — contracts only (no private_reservations)
--   3. Replace fn_get_booked_dates   — contracts only (no private_reservations)
--   4. Drop triggers and trigger functions for private_reservations
--   5. Drop private_reservation_extras and private_reservations tables
--   NOTE: anon SELECT policy on quotes already exists in 20260527000010_public_quotes_rls.sql
-- =============================================================================

-- ── 1. Add columns to quotes ──────────────────────────────────────────────────
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS time_slot_id     UUID REFERENCES time_slots(id),
  ADD COLUMN IF NOT EXISTS mp_preference_id TEXT,
  ADD COLUMN IF NOT EXISTS snack_option_id  UUID REFERENCES snack_options(id),
  ADD COLUMN IF NOT EXISTS package_id       UUID REFERENCES packages(id);

-- ── 2. fn_check_slot_conflict — contracts only ────────────────────────────────
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
  WHERE venue_id      = p_venue_id
    AND fecha_evento  = p_fecha
    AND hora_inicio::TEXT = p_hora_inicio
    AND estado NOT IN ('cancelado')
    AND (p_exclude_contract IS NULL OR id <> p_exclude_contract);
  RETURN v_count > 0;
END; $$;

GRANT EXECUTE ON FUNCTION fn_check_slot_conflict(UUID, DATE, TEXT, TEXT, UUID) TO anon, authenticated;

-- ── 3. fn_get_booked_dates — contracts only ───────────────────────────────────
CREATE OR REPLACE FUNCTION fn_get_booked_dates(
  p_venue_id    UUID,
  p_from_date   DATE,
  p_to_date     DATE,
  p_hora_inicio TEXT DEFAULT NULL
) RETURNS TABLE(fecha DATE, hora_inicio TEXT, hora_fin TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.fecha_evento                  AS fecha,
    c.hora_inicio::TEXT             AS hora_inicio,
    COALESCE(c.hora_fin::TEXT, '')  AS hora_fin
  FROM contracts c
  WHERE c.venue_id     = p_venue_id
    AND c.fecha_evento BETWEEN p_from_date AND p_to_date
    AND c.estado NOT IN ('cancelado')
    AND (p_hora_inicio IS NULL OR c.hora_inicio::TEXT = p_hora_inicio);
END; $$;

GRANT EXECUTE ON FUNCTION fn_get_booked_dates(UUID, DATE, DATE, TEXT) TO anon, authenticated;

-- ── 4. Drop triggers and trigger functions ────────────────────────────────────
DROP TRIGGER IF EXISTS trg_reservation_on_insert ON private_reservations;
DROP FUNCTION IF EXISTS fn_reservation_on_insert();
DROP TRIGGER IF EXISTS trg_reservation_confirmed ON private_reservations;
DROP FUNCTION IF EXISTS fn_reservation_confirmed_to_contract();

-- ── 5. Drop private reservations tables (FK-safe order) ──────────────────────
DROP TABLE IF EXISTS private_reservation_extras CASCADE;
DROP TABLE IF EXISTS private_reservations CASCADE;
