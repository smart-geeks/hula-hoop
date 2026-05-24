-- ==============================================================================
-- Migration: 20260523000006_fix_venue_users_backfill.sql
--
-- Problema raíz:
--   La migración 20260523000004 pobló venue_users DESDE profiles.
--   Pero profiles solo contiene usuarios creados DESPUÉS del trigger
--   on_auth_user_created (migration 20260523000001). Los usuarios
--   pre-existentes en auth.users no tienen fila en profiles, por lo tanto
--   no entraron a venue_users, por lo tanto user_venue_ids() retorna {}
--   y el RLS bloquea toda lectura y escritura.
--
-- Solución:
--   1. Backfill profiles para todos los usuarios de auth.users que falten.
--   2. Backfill venue_users para TODOS los usuarios de auth.users, usando
--      el rol de profiles si existe, 'staff' como fallback.
-- ==============================================================================

-- Paso 1: Asegurar que todos los auth.users tengan fila en profiles
INSERT INTO profiles (id, full_name, email, role)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', ''),
  COALESCE(u.email, ''),
  'staff'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- Paso 2: Asegurar que todos los usuarios estén en venue_users para el venue por defecto
INSERT INTO venue_users (venue_id, user_id, role)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  u.id,
  COALESCE(
    (SELECT CASE p.role
       WHEN 'owner'    THEN 'owner'
       WHEN 'admin'    THEN 'admin'
       WHEN 'readonly' THEN 'readonly'
       ELSE                 'staff'
     END
     FROM profiles p WHERE p.id = u.id),
    'staff'
  )
FROM auth.users u
ON CONFLICT (venue_id, user_id) DO NOTHING;

-- Paso 3: GRANT EXECUTE en create_venue para usuarios autenticados (garantía)
GRANT EXECUTE ON FUNCTION create_venue(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
