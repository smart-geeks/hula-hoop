-- ==============================================================================
-- Migration: 20260626000002_cash_closure_fields.sql
-- Adición de campos para corte de caja (conciliación, NIP y arqueo) en pos_sessions
-- ==============================================================================

ALTER TABLE pos_sessions 
  ADD COLUMN IF NOT EXISTS opening_cash      NUMERIC(12,2) DEFAULT 0, -- Fondo de apertura
  ADD COLUMN IF NOT EXISTS expected_cash     NUMERIC(12,2) DEFAULT 0, -- Efectivo esperado en caja (sistema)
  ADD COLUMN IF NOT EXISTS declared_cash     NUMERIC(12,2) DEFAULT 0, -- Efectivo contado físico
  ADD COLUMN IF NOT EXISTS expected_card     NUMERIC(12,2) DEFAULT 0, -- Ventas con tarjeta (sistema)
  ADD COLUMN IF NOT EXISTS declared_card     NUMERIC(12,2) DEFAULT 0, -- Tarjetas declaradas
  ADD COLUMN IF NOT EXISTS expected_transfer NUMERIC(12,2) DEFAULT 0, -- Transferencias (sistema)
  ADD COLUMN IF NOT EXISTS declared_transfer NUMERIC(12,2) DEFAULT 0, -- Transferencias declaradas
  ADD COLUMN IF NOT EXISTS cash_difference   NUMERIC(12,2) DEFAULT 0, -- Diferencia de efectivo (declarado - esperado)
  ADD COLUMN IF NOT EXISTS notes             TEXT,                    -- Comentarios / observaciones
  ADD COLUMN IF NOT EXISTS closed_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL; -- Quién cerró la caja (usuario)

COMMENT ON COLUMN pos_sessions.opening_cash IS 'Fondo inicial de apertura ingresado por el cajero.';
COMMENT ON COLUMN pos_sessions.expected_cash IS 'Efectivo esperado según registros del sistema.';
COMMENT ON COLUMN pos_sessions.declared_cash IS 'Efectivo contado físicamente por el cajero en el corte.';
COMMENT ON COLUMN pos_sessions.expected_card IS 'Monto total en tarjetas esperado según el sistema.';
COMMENT ON COLUMN pos_sessions.declared_card IS 'Monto en tarjetas reportado por el cajero.';
COMMENT ON COLUMN pos_sessions.expected_transfer IS 'Monto total en transferencias esperado según el sistema.';
COMMENT ON COLUMN pos_sessions.declared_transfer IS 'Monto en transferencias reportado por el cajero.';
COMMENT ON COLUMN pos_sessions.cash_difference IS 'Diferencia calculada en efectivo (declarado - esperado).';
COMMENT ON COLUMN pos_sessions.notes IS 'Observaciones y comentarios añadidos en el cierre.';
COMMENT ON COLUMN pos_sessions.closed_by IS 'Usuario autenticado que realizó o autorizó el cierre de caja.';
