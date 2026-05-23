-- ==============================================================================
-- Migration: 20260523000002_fix_cashier_search_path.sql
-- Fix: pgcrypto (crypt/gen_salt) vive en el esquema `extensions` en Supabase.
-- Las funciones tenían SET search_path = public, por lo que crypt() no se
-- resolvía en runtime aunque la función se creaba sin errores.
-- Solución: añadir `extensions` al search_path de las tres RPCs afectadas.
-- ==============================================================================

CREATE OR REPLACE FUNCTION create_cashier(
  p_nombre TEXT,
  p_pin    TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.cashier_profiles (nombre, pin_hash)
  VALUES (p_nombre, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION validate_cashier_pin(
  p_cashier_id UUID,
  p_pin        TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash   TEXT;
  v_activo BOOLEAN;
BEGIN
  SELECT pin_hash, activo
    INTO v_hash, v_activo
    FROM public.cashier_profiles
   WHERE id = p_cashier_id;

  IF v_hash IS NULL OR NOT v_activo THEN
    RETURN NULL;
  END IF;

  IF v_hash = extensions.crypt(p_pin, v_hash) THEN
    RETURN p_cashier_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION update_cashier_pin(
  p_cashier_id UUID,
  p_new_pin    TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.cashier_profiles
     SET pin_hash   = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 8)),
         updated_at = NOW()
   WHERE id = p_cashier_id;

  RETURN FOUND;
END;
$$;
