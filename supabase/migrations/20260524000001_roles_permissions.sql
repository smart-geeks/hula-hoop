-- ==============================================================================
-- Migration: 20260524000001_roles_permissions.sql
-- Roles & Permisos Dinámicos
-- ==============================================================================

-- ── 1. TABLA DE ROLES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  es_preset   BOOLEAN NOT NULL DEFAULT FALSE,
  permisos    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS en roles
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- ── 2. SEED DE ROLES PREDETERMINADOS ─────────────────────────────────────────
-- Insertamos los 5 roles predefinidos con sus matrices CRUD en JSONB
INSERT INTO roles (nombre, slug, descripcion, es_preset, permisos)
VALUES 
  (
    'Dueño / Owner', 
    'owner', 
    'Acceso total e ilimitado a todas las sucursales, menús y configuraciones globales.', 
    TRUE,
    '{
      "hoy": {"c": true, "r": true, "u": true, "d": true},
      "calendario": {"c": true, "r": true, "u": true, "d": true},
      "reservas": {"c": true, "r": true, "u": true, "d": true},
      "eventos": {"c": true, "r": true, "u": true, "d": true},
      "clientes": {"c": true, "r": true, "u": true, "d": true},
      "cotizaciones": {"c": true, "r": true, "u": true, "d": true},
      "contratos": {"c": true, "r": true, "u": true, "d": true},
      "gastos": {"c": true, "r": true, "u": true, "d": true},
      "compras": {"c": true, "r": true, "u": true, "d": true},
      "inventario": {"c": true, "r": true, "u": true, "d": true},
      "proveedores": {"c": true, "r": true, "u": true, "d": true},
      "configuracion": {"c": true, "r": true, "u": true, "d": true},
      "reportes": {"c": true, "r": true, "u": true, "d": true},
      "paquetes": {"c": true, "r": true, "u": true, "d": true},
      "extras": {"c": true, "r": true, "u": true, "d": true},
      "meriendas": {"c": true, "r": true, "u": true, "d": true},
      "horarios": {"c": true, "r": true, "u": true, "d": true},
      "restaurante": {"c": true, "r": true, "u": true, "d": true},
      "galeria": {"c": true, "r": true, "u": true, "d": true}
    }'
  ),
  (
    'Manager de Sucursal', 
    'manager', 
    'Gestión operativa de la sucursal asignada. Sin acceso a configuraciones técnicas globales.', 
    TRUE,
    '{
      "hoy": {"c": true, "r": true, "u": true, "d": true},
      "calendario": {"c": true, "r": true, "u": true, "d": true},
      "reservas": {"c": true, "r": true, "u": true, "d": true},
      "eventos": {"c": true, "r": true, "u": true, "d": true},
      "clientes": {"c": true, "r": true, "u": true, "d": true},
      "cotizaciones": {"c": true, "r": true, "u": true, "d": true},
      "contratos": {"c": true, "r": true, "u": true, "d": false},
      "gastos": {"c": true, "r": true, "u": true, "d": false},
      "compras": {"c": true, "r": true, "u": true, "d": false},
      "inventario": {"c": true, "r": true, "u": true, "d": true},
      "proveedores": {"c": true, "r": true, "u": true, "d": true},
      "configuracion": {"c": false, "r": false, "u": false, "d": false},
      "reportes": {"c": false, "r": true, "u": false, "d": false},
      "paquetes": {"c": true, "r": true, "u": true, "d": false},
      "extras": {"c": true, "r": true, "u": true, "d": false},
      "meriendas": {"c": true, "r": true, "u": true, "d": false},
      "horarios": {"c": true, "r": true, "u": true, "d": false},
      "restaurante": {"c": true, "r": true, "u": true, "d": false},
      "galeria": {"c": true, "r": true, "u": true, "d": true}
    }'
  ),
  (
    'Socio', 
    'socio', 
    'Acceso de auditoría y reportes a nivel global y de sucursales sin permisos de edición.', 
    TRUE,
    '{
      "hoy": {"c": false, "r": true, "u": false, "d": false},
      "calendario": {"c": false, "r": true, "u": false, "d": false},
      "reservas": {"c": false, "r": true, "u": false, "d": false},
      "eventos": {"c": false, "r": true, "u": false, "d": false},
      "clientes": {"c": false, "r": true, "u": false, "d": false},
      "cotizaciones": {"c": false, "r": true, "u": false, "d": false},
      "contratos": {"c": false, "r": true, "u": false, "d": false},
      "gastos": {"c": false, "r": true, "u": false, "d": false},
      "compras": {"c": false, "r": true, "u": false, "d": false},
      "inventario": {"c": false, "r": true, "u": false, "d": false},
      "proveedores": {"c": false, "r": true, "u": false, "d": false},
      "configuracion": {"c": false, "r": false, "u": false, "d": false},
      "reportes": {"c": false, "r": true, "u": false, "d": false},
      "paquetes": {"c": false, "r": true, "u": false, "d": false},
      "extras": {"c": false, "r": true, "u": false, "d": false},
      "meriendas": {"c": false, "r": true, "u": false, "d": false},
      "horarios": {"c": false, "r": true, "u": false, "d": false},
      "restaurante": {"c": false, "r": true, "u": false, "d": false},
      "galeria": {"c": false, "r": true, "u": false, "d": false}
    }'
  ),
  (
    'Cajera / POS', 
    'cajera', 
    'Registrar ventas rápidas, gestionar turnos y ver estado de caja. Bloqueada de finanzas corporativas.', 
    TRUE,
    '{
      "hoy": {"c": true, "r": true, "u": true, "d": false},
      "calendario": {"c": false, "r": true, "u": false, "d": false},
      "reservas": {"c": true, "r": true, "u": true, "d": false},
      "eventos": {"c": false, "r": true, "u": false, "d": false},
      "clientes": {"c": true, "r": true, "u": true, "d": false},
      "cotizaciones": {"c": false, "r": false, "u": false, "d": false},
      "contratos": {"c": false, "r": false, "u": false, "d": false},
      "gastos": {"c": false, "r": false, "u": false, "d": false},
      "compras": {"c": false, "r": false, "u": false, "d": false},
      "inventario": {"c": false, "r": true, "u": false, "d": false},
      "proveedores": {"c": false, "r": false, "u": false, "d": false},
      "configuracion": {"c": false, "r": false, "u": false, "d": false},
      "reportes": {"c": false, "r": false, "u": false, "d": false},
      "paquetes": {"c": false, "r": false, "u": false, "d": false},
      "extras": {"c": false, "r": false, "u": false, "d": false},
      "meriendas": {"c": false, "r": false, "u": false, "d": false},
      "horarios": {"c": false, "r": false, "u": false, "d": false},
      "restaurante": {"c": false, "r": false, "u": false, "d": false},
      "galeria": {"c": false, "r": false, "u": false, "d": false}
    }'
  ),
  (
    'Personal Staff', 
    'staff', 
    'Acceso operativo básico para visualizar eventos del día y calendario de montajes.', 
    TRUE,
    '{
      "hoy": {"c": false, "r": true, "u": false, "d": false},
      "calendario": {"c": false, "r": true, "u": false, "d": false},
      "reservas": {"c": false, "r": true, "u": false, "d": false},
      "eventos": {"c": false, "r": true, "u": false, "d": false},
      "clientes": {"c": false, "r": true, "u": false, "d": false},
      "cotizaciones": {"c": false, "r": false, "u": false, "d": false},
      "contratos": {"c": false, "r": false, "u": false, "d": false},
      "gastos": {"c": false, "r": false, "u": false, "d": false},
      "compras": {"c": false, "r": false, "u": false, "d": false},
      "inventario": {"c": false, "r": true, "u": false, "d": false},
      "proveedores": {"c": false, "r": false, "u": false, "d": false},
      "configuracion": {"c": false, "r": false, "u": false, "d": false},
      "reportes": {"c": false, "r": false, "u": false, "d": false},
      "paquetes": {"c": false, "r": false, "u": false, "d": false},
      "extras": {"c": false, "r": false, "u": false, "d": false},
      "meriendas": {"c": false, "r": false, "u": false, "d": false},
      "horarios": {"c": false, "r": false, "u": false, "d": false},
      "restaurante": {"c": false, "r": false, "u": false, "d": false},
      "galeria": {"c": false, "r": false, "u": false, "d": false}
    }'
  )
ON CONFLICT (slug) DO UPDATE
SET permisos = EXCLUDED.permisos, descripcion = EXCLUDED.descripcion;

-- POLÍTICAS DE RLS PARA LA TABLA DE ROLES
DROP POLICY IF EXISTS "roles_select_auth" ON roles;
CREATE POLICY "roles_select_auth" ON roles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "roles_all_owner" ON roles;
CREATE POLICY "roles_all_owner" ON roles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM venue_users vu
      WHERE vu.user_id = auth.uid()
        AND vu.role = 'owner'
    )
  );

-- ── 3. EXTENDER TABLA venue_users CON LA LLAVE FORÁNEA role_id ────────────────
ALTER TABLE venue_users 
  ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id) ON DELETE RESTRICT;

-- ── 4. BACKFILL MASIVO Y SEGURO DE REGISTROS EXISTENTES ───────────────────────
-- Vinculamos las cadenas de texto del rol anterior ('owner', 'admin', 'staff', 'readonly')
-- a los IDs de nuestra nueva tabla dinámica 'roles'

-- Asignar Dueño / Owner
UPDATE venue_users
SET role_id = (SELECT id FROM roles WHERE slug = 'owner')
WHERE role IN ('owner', 'admin') AND role_id IS NULL;

-- Asignar Personal Staff como fallback
UPDATE venue_users
SET role_id = (SELECT id FROM roles WHERE slug = 'staff')
WHERE role IN ('staff', 'readonly') AND role_id IS NULL;

-- Cualquier otro remanente asignarlo a staff por seguridad absoluta
UPDATE venue_users
SET role_id = (SELECT id FROM roles WHERE slug = 'staff')
WHERE role_id IS NULL;

-- Hacer que role_id sea obligatorio (NOT NULL) tras el backfill exitoso
ALTER TABLE venue_users ALTER COLUMN role_id SET NOT NULL;
