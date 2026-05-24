-- ==============================================================================
-- Migration: 20260523000007_seed_default_venue_config.sql
--
-- Problema:
--   venue_config es una tabla pre-existente de producción. Si estaba vacía
--   cuando corrió la migración 20260523000004, el UPDATE fue un no-op y
--   no existe ninguna fila para el salón por defecto. El servicio Angular
--   usa .single() que retorna error cuando hay 0 filas → null → "No se encontró".
--
-- Solución:
--   Insertar una fila de configuración por defecto para el venue principal.
--   ON CONFLICT DO NOTHING: idempotente, no destruye datos existentes.
--
-- También habilitamos RLS explícitamente por si acaso no estaba activo.
-- ==============================================================================

-- Asegurar que RLS está habilitado en venue_config
ALTER TABLE venue_config ENABLE ROW LEVEL SECURITY;

-- Insertar fila de configuración por defecto si no existe ninguna para el venue
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
  '00000000-0000-0000-0000-000000000001'::uuid,
  20,       -- capacidad por slot
  15000,    -- $150.00 MXN ticket playdate
  5000,     -- $50.00 MXN adulto extra
  24,       -- 24 horas mínimo antes de reserva privada
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM venue_config
  WHERE venue_id = '00000000-0000-0000-0000-000000000001'
);
