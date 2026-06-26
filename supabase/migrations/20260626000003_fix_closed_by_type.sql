-- ==============================================================================
-- Migration: 20260626000003_fix_closed_by_type.sql
-- Cambiar el tipo de closed_by a TEXT en pos_sessions para soportar nombres de cajeros
-- ==============================================================================

ALTER TABLE pos_sessions 
  DROP COLUMN IF EXISTS closed_by;

ALTER TABLE pos_sessions 
  ADD COLUMN closed_by TEXT;

COMMENT ON COLUMN pos_sessions.closed_by IS 'Nombre o identificación de quien realizó o autorizó el cierre de caja.';
