-- ==============================================================================
-- Migration: 20260527000005_fix_venues_update_policy.sql
--
-- Problema: La política "venues_manage" (FOR ALL) usa user_is_owner_of(id),
-- bloqueando el UPDATE para usuarios con rol 'admin'. Además, venue_users
-- requiere role_id (FK a roles) NOT NULL, por lo que el INSERT retrocompatible
-- debe incluirlo.
--
-- Solución:
--   1. Separar política en UPDATE (owner+admin) y DELETE (solo owner).
--   2. Garantizar owner en venue_users para el venue original, incluyendo
--      el role_id correcto desde la tabla roles.
-- ==============================================================================

-- ── 1. Corregir políticas RLS de venues ──────────────────────────────────────

DROP POLICY IF EXISTS "venues_manage"        ON venues;
DROP POLICY IF EXISTS "venues_admin_update"  ON venues;
DROP POLICY IF EXISTS "venues_owner_delete"  ON venues;
DROP POLICY IF EXISTS "venues_owner_insert"  ON venues;

-- UPDATE: owners y admins pueden editar la info operativa del venue
CREATE POLICY "venues_admin_update" ON venues
  FOR UPDATE TO authenticated
  USING     (user_is_manager_of(id))
  WITH CHECK (user_is_manager_of(id));

-- DELETE: solo owners pueden eliminar venues
CREATE POLICY "venues_owner_delete" ON venues
  FOR DELETE TO authenticated
  USING (user_is_owner_of(id));

-- INSERT: el RPC create_venue usa SECURITY DEFINER, pero necesita permiso base
CREATE POLICY "venues_owner_insert" ON venues
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ── 2. Garantizar owner en venue_users para el venue original ─────────────────
-- Incluye role_id (FK requerida por migración 20260524000001_roles_permissions)
INSERT INTO venue_users (venue_id, user_id, role, role_id)
SELECT
  '00000000-0000-0000-0000-000000000001',
  u.id,
  'owner',
  r.id
FROM auth.users u
CROSS JOIN roles r
WHERE r.slug = 'owner'
  AND NOT EXISTS (
    SELECT 1 FROM venue_users vu
    WHERE vu.venue_id = '00000000-0000-0000-0000-000000000001'
      AND vu.role = 'owner'
  )
ORDER BY u.created_at
LIMIT 1
ON CONFLICT (venue_id, user_id) DO UPDATE
  SET role    = 'owner',
      role_id = EXCLUDED.role_id;
