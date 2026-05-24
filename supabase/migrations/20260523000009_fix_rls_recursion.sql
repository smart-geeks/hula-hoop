-- ==============================================================================
-- Migration: 20260523000009_fix_rls_recursion.sql
--
-- Problema: Infinite recursion en policies de venue_users y venues.
--
-- La cadena:
--   SELECT venues → venues_manage.USING → EXISTS(SELECT venue_users)
--   → venue_users_managers_select.USING → EXISTS(SELECT venue_users vu2)
--   → venue_users_managers_select.USING → ♾️ recursión infinita
--
--   INSERT venue_users → venue_users_owners_manage.USING → EXISTS(SELECT venue_users vu2)
--   → venue_users_owners_manage.USING → ♾️ recursión infinita
--
-- Solución: helpers SECURITY DEFINER que bypasean RLS al consultar venue_users
--   internamente, eliminando la recursión de raíz.
-- ==============================================================================

-- ── Helpers SECURITY DEFINER ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION user_is_owner_of(p_venue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM venue_users
    WHERE venue_id = p_venue_id
      AND user_id  = auth.uid()
      AND role     = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION user_is_manager_of(p_venue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM venue_users
    WHERE venue_id = p_venue_id
      AND user_id  = auth.uid()
      AND role    IN ('owner', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION user_is_owner_of(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION user_is_manager_of(UUID) TO authenticated;

-- ── Corregir venue_users policies (quitar EXISTS recursivos) ──────────────────

DROP POLICY IF EXISTS "venue_users_self_select"      ON venue_users;
DROP POLICY IF EXISTS "venue_users_managers_select"  ON venue_users;
DROP POLICY IF EXISTS "venue_users_owners_manage"    ON venue_users;

-- Cualquier miembro de un venue puede ver todos los miembros de ese venue
CREATE POLICY "venue_users_member_select" ON venue_users
  FOR SELECT TO authenticated
  USING (venue_id = ANY(user_venue_ids()));

-- Solo owners pueden gestionar (agregar/editar/eliminar) miembros
CREATE POLICY "venue_users_owner_manage" ON venue_users
  FOR ALL TO authenticated
  USING     (user_is_owner_of(venue_id))
  WITH CHECK (user_is_owner_of(venue_id));

-- ── Corregir venues policies (quitar EXISTS recursivo) ────────────────────────

DROP POLICY IF EXISTS "venues_manage" ON venues;

-- Solo owners pueden editar/eliminar venues existentes
CREATE POLICY "venues_manage" ON venues
  FOR ALL TO authenticated
  USING     (user_is_owner_of(id))
  WITH CHECK (user_is_owner_of(id));
