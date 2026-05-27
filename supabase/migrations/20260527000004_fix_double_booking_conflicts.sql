-- ==============================================================================
-- Migration: 20260527000004_fix_double_booking_conflicts.sql
--
-- 1. Cancela 4 reservas duplicadas históricas (pruebas y doble-bookings)
--    que bloquean la creación del índice único parcial anti-doble-booking.
-- 2. Aplica el índice único definitivo en private_reservations.
--
-- Identificadas por auditoría QA (docs/architect_qa_review_report.md):
--   Conflicto 1 (2026-04-21): reserva TEST cancelada
--   Conflicto 2 (2026-04-25): duplicado del mismo cliente cancelado
--   Conflicto 3 (2026-04-29): 2 duplicados del mismo cliente cancelados
-- ==============================================================================

-- ── 1. Cancelar reservas duplicadas o de prueba ───────────────────────────────
UPDATE private_reservations
SET status = 'cancelled'
WHERE id IN (
  'd8ff962d-b2af-4dd0-a5ae-c08dd6466263', -- TEST — conflicto 1 (2026-04-21)
  '2bff085d-398e-4522-94f1-3fe0b46a3b13', -- Duplicado — conflicto 2 (2026-04-25)
  '9ed3df9e-d6ed-4dfd-a9ca-e5c4b5b60dfa', -- Duplicado 1 — conflicto 3 (2026-04-29)
  '77b850e8-a823-41c2-aa35-a4d2d546bbb7'  -- Duplicado 2 — conflicto 3 (2026-04-29)
);

-- ── 2. Índice único parcial anti-doble-booking ────────────────────────────────
-- Solo bloquea una reserva confirmed/completed por slot.
-- Las reservas pending_payment pueden coexistir (aún no pagan).
CREATE UNIQUE INDEX IF NOT EXISTS idx_private_reservations_confirmed_slot
  ON private_reservations(reservation_date, time_slot_id)
  WHERE status IN ('confirmed', 'completed');
