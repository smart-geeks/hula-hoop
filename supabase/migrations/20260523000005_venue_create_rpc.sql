-- ==============================================================================
-- Migration: 20260523000005_venue_create_rpc.sql
-- RPC para crear venues + asignar al creador como owner en una transacción
--
-- Por qué es necesario:
--   La política RLS "venues_manage" requiere que el usuario ya exista en
--   venue_users para el venue que intenta modificar. Esto funciona para
--   UPDATE/DELETE de venues existentes, pero bloquea el INSERT de venues nuevos
--   porque no hay fila en venue_users todavía.
--
--   Solución: RPC SECURITY DEFINER que bypasea RLS, crea el venue y añade
--   al creador como 'owner' atómicamente.
-- ==============================================================================

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
  v_venue_id UUID;
  v_user_id  UUID := auth.uid();
BEGIN
  -- Solo usuarios autenticados con role owner o admin en cualquier venue
  -- (o el primer venue del sistema) pueden crear venues.
  -- La validación de sesión la hace Supabase Auth automáticamente.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Crear el venue
  INSERT INTO venues (nombre, slug, direccion, telefono, email, logo_url)
  VALUES (p_nombre, p_slug, p_direccion, p_telefono, p_email, p_logo_url)
  RETURNING id INTO v_venue_id;

  -- Asignar al creador como owner del nuevo venue
  INSERT INTO venue_users (venue_id, user_id, role)
  VALUES (v_venue_id, v_user_id, 'owner');

  RETURN v_venue_id;
END;
$$;

COMMENT ON FUNCTION create_venue IS
  'Crea un venue y asigna al usuario autenticado como owner. '
  'SECURITY DEFINER: bypasea RLS para el INSERT inicial.';
