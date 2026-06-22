-- =============================================================================
-- Migration: 20260622000001_slot_conflict_validation.sql
--
-- Anti-double-booking layer for contracts:
--   1. RPC fn_check_slot_conflict — returns TRUE if a slot is already taken
--   2. RPC fn_get_booked_dates    — returns booked dates in a range
--   3. Unique partial index on contracts (attempts creation; skips if duplicates exist)
-- =============================================================================

-- ── 1. fn_check_slot_conflict ─────────────────────────────────────────────────
-- Returns TRUE when the venue+date+slot is already taken by an active contract
-- or a confirmed/pending private reservation.
CREATE OR REPLACE FUNCTION fn_check_slot_conflict(
  p_venue_id          UUID,
  p_fecha             DATE,
  p_hora_inicio       TEXT,
  p_hora_fin          TEXT     DEFAULT NULL,
  p_exclude_contract  UUID     DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Check contracts table
  SELECT COUNT(*) INTO v_count
  FROM contracts
  WHERE venue_id   = p_venue_id
    AND fecha_evento = p_fecha
    AND hora_inicio::TEXT = p_hora_inicio
    AND estado NOT IN ('cancelado')
    AND (p_exclude_contract IS NULL OR id <> p_exclude_contract);

  IF v_count > 0 THEN RETURN TRUE; END IF;

  -- Check private_reservations (confirmed or pending_payment, not yet linked to contract)
  SELECT COUNT(*) INTO v_count
  FROM private_reservations pr
  JOIN time_slots ts ON ts.id = pr.time_slot_id
  WHERE pr.venue_id        = p_venue_id
    AND pr.reservation_date = p_fecha::TEXT
    AND ts.start_time       = p_hora_inicio
    AND pr.status IN ('confirmed', 'pending_payment')
    AND pr.contract_id IS NULL;

  RETURN v_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_check_slot_conflict(UUID, DATE, TEXT, TEXT, UUID) TO anon, authenticated;

-- ── 2. fn_get_booked_dates ────────────────────────────────────────────────────
-- Returns every booked (fecha, hora_inicio, hora_fin) in the given range.
-- Used by the frontend to compute available alternative dates.
CREATE OR REPLACE FUNCTION fn_get_booked_dates(
  p_venue_id    UUID,
  p_from_date   DATE,
  p_to_date     DATE,
  p_hora_inicio TEXT DEFAULT NULL
) RETURNS TABLE(fecha DATE, hora_inicio TEXT, hora_fin TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- From active contracts
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

  -- From confirmed / pending private reservations (not yet converted to contract)
  RETURN QUERY
  SELECT
    pr.reservation_date::DATE AS fecha,
    ts.start_time             AS hora_inicio,
    ts.end_time               AS hora_fin
  FROM private_reservations pr
  JOIN time_slots ts ON ts.id = pr.time_slot_id
  WHERE pr.venue_id         = p_venue_id
    AND pr.reservation_date::DATE BETWEEN p_from_date AND p_to_date
    AND pr.status IN ('confirmed', 'pending_payment')
    AND pr.contract_id IS NULL
    AND (p_hora_inicio IS NULL OR ts.start_time = p_hora_inicio);
END;
$$;

GRANT EXECUTE ON FUNCTION fn_get_booked_dates(UUID, DATE, DATE, TEXT) TO anon, authenticated;

-- ── 3. Unique partial index on contracts ──────────────────────────────────────
-- Prevents DB-level double-booking for future inserts.
-- Will silently skip if existing duplicates prevent creation.
DO $$
BEGIN
  CREATE UNIQUE INDEX idx_contracts_unique_slot
    ON contracts(venue_id, fecha_evento, hora_inicio)
    WHERE estado NOT IN ('cancelado');
  RAISE NOTICE 'idx_contracts_unique_slot created successfully.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'idx_contracts_unique_slot could not be created (existing conflicts). Run manual cleanup, then re-apply.';
END $$;
