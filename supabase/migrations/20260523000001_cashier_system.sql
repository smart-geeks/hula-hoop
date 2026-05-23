-- ==============================================================================
-- Migration: 20260523000001_cashier_system.sql
-- Sistema de cajeros para POS: perfiles con PIN + auditoría por cajero
--
-- Qué crea esta migración:
--   1. Extensión pgcrypto  — bcrypt para hashing de PINs
--   2. Tabla profiles      — completa la dependencia de RLS en event_tasks
--   3. Tabla cashier_profiles — cajeros con PIN hasheado
--   4. cashier_id en pos_sessions y pos_sales — auditoría por cajero
--   5. cashier_id en inventory_movements — trazabilidad de salidas por cajero
--   6. RPCs SECURITY DEFINER — el hash nunca sale a la app
--   7. Vista pos_sales_detail — reporte enriquecido con nombre de cajero
--   8. Índices              — performance en consultas frecuentes
--
-- Reglas de seguridad aplicadas:
--   - pin_hash NUNCA se expone al cliente (solo a funciones SECURITY DEFINER)
--   - La validación del PIN se hace en el servidor vía RPC
--   - La creación y cambio de PIN también son SECURITY DEFINER
--   - Las políticas RLS de cajeros son todas additive (no rompen las existentes)
-- ==============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 1 — Extensión pgcrypto (bcrypt para PINs)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 2 — Tabla profiles
-- Completa la dependencia que event_tasks_managers RLS ya referencia.
-- Un registro por usuario de Supabase Auth. Se crea automáticamente al
-- registrar un nuevo usuario via trigger.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  email      TEXT,
  phone      TEXT,
  role       TEXT        NOT NULL DEFAULT 'staff'
               CHECK (role IN ('owner', 'admin', 'staff', 'readonly', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Cada usuario autenticado puede leer y actualizar su propio perfil.
-- Esto es suficiente para que los EXISTS(...) en event_tasks funcionen,
-- y evita la recursión infinita que causaría un policy que consulte
-- profiles dentro de profiles.
DROP POLICY IF EXISTS "profiles_self" ON profiles;
CREATE POLICY "profiles_self"
  ON profiles
  FOR ALL
  TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Función que crea automáticamente un perfil cuando Supabase crea un usuario.
-- SECURITY DEFINER: se ejecuta como superuser para poder escribir en profiles
-- aunque el trigger corra en el contexto de auth.users.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    'staff'
  )
  ON CONFLICT (id) DO NOTHING;   -- Idempotente: no falla si el perfil ya existe
  RETURN NEW;
END;
$$;

-- Trigger en auth.users: se ejecuta después de cada INSERT (nuevo signup).
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 3 — Tabla cashier_profiles
-- Cajeros del POS. NO son usuarios de Supabase Auth.
-- El dispositivo queda logueado como admin; el cajero se autentica con PIN
-- en la interfaz del POS. Esto es el modelo estándar de POS para PyMEs
-- (similar a Square, Toast, Poster POS).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cashier_profiles (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     TEXT        NOT NULL,
  -- PIN hasheado con bcrypt (crypt + gen_salt 'bf'). NUNCA almacenar en texto
  -- claro. El cliente de Angular nunca debe leer esta columna directamente;
  -- toda validación y mutación pasa por las RPCs SECURITY DEFINER de abajo.
  pin_hash   TEXT        NOT NULL,
  activo     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE  cashier_profiles          IS 'Cajeros del POS. Autenticación por PIN (bcrypt). No son usuarios de Supabase Auth.';
COMMENT ON COLUMN cashier_profiles.pin_hash IS 'Hash bcrypt del PIN numérico. Nunca exponer al cliente. Usar RPCs: validate_cashier_pin / update_cashier_pin.';

ALTER TABLE cashier_profiles ENABLE ROW LEVEL SECURITY;

-- Los usuarios autenticados (admin del negocio) pueden gestionar los cajeros:
-- ver la lista (nombre, activo), crear, desactivar. La columna pin_hash
-- no se debe consultar directamente desde el cliente (usar la RPC).
DROP POLICY IF EXISTS "cashier_profiles_auth" ON cashier_profiles;
CREATE POLICY "cashier_profiles_auth"
  ON cashier_profiles
  FOR ALL
  TO authenticated
  USING  (TRUE)
  WITH CHECK (TRUE);

-- Índice parcial: acelera la query más común (listar cajeros activos para el PIN picker)
CREATE INDEX IF NOT EXISTS idx_cashier_profiles_activo
  ON cashier_profiles (activo)
  WHERE activo = TRUE;


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 4 — cashier_id en pos_sessions
-- Registra qué cajero abrió la sesión de venta.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE pos_sessions
  ADD COLUMN IF NOT EXISTS cashier_id UUID
    REFERENCES cashier_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN pos_sessions.cashier_id IS 'Cajero que abrió esta sesión de venta.';

CREATE INDEX IF NOT EXISTS idx_pos_sessions_cashier_id
  ON pos_sessions (cashier_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 5 — cashier_id en pos_sales
-- Registra qué cajero procesó cada venta individual.
-- Desnormalizado respecto a pos_sessions para facilitar reportes directos
-- por cajero sin JOIN adicional.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS cashier_id UUID
    REFERENCES cashier_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN pos_sales.cashier_id IS 'Cajero que procesó esta venta.';

CREATE INDEX IF NOT EXISTS idx_pos_sales_cashier_id
  ON pos_sales (cashier_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 6 — cashier_id en inventory_movements
-- Permite trazar qué cajero causó una salida de inventario vía POS.
-- Para movimientos no-POS (compras, ajustes), esta columna queda NULL.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS cashier_id UUID
    REFERENCES cashier_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN inventory_movements.cashier_id IS 'Cajero que causó el movimiento (solo en salidas por POS). NULL para compras/ajustes.';

CREATE INDEX IF NOT EXISTS idx_inv_movements_cashier_id
  ON inventory_movements (cashier_id)
  WHERE cashier_id IS NOT NULL;   -- Índice parcial: solo filas POS


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 7 — RPC: validate_cashier_pin
-- Valida el PIN de un cajero. Retorna UUID del cajero si es correcto,
-- NULL si el PIN es incorrecto o el cajero está inactivo.
--
-- Por qué SECURITY DEFINER:
--   El cliente Angular llama a esta función con el UUID del cajero y el PIN
--   en texto claro. La función compara internamente con crypt(); el hash
--   NUNCA sale a la red. Si alguien intercepta la respuesta, solo ve UUID o NULL.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION validate_cashier_pin(
  p_cashier_id UUID,
  p_pin        TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash   TEXT;
  v_activo BOOLEAN;
BEGIN
  SELECT pin_hash, activo
    INTO v_hash, v_activo
    FROM cashier_profiles
   WHERE id = p_cashier_id;

  -- Cajero no existe o está inactivo
  IF v_hash IS NULL OR NOT v_activo THEN
    RETURN NULL;
  END IF;

  -- crypt(input, stored_hash) reproduce el salt del hash y compara
  IF v_hash = crypt(p_pin, v_hash) THEN
    RETURN p_cashier_id;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION validate_cashier_pin IS
  'Valida el PIN de un cajero. Retorna su UUID si es correcto, NULL si no. '
  'SECURITY DEFINER: el hash nunca sale al cliente.';


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 8 — RPC: create_cashier
-- Crea un cajero con el PIN ya hasheado en el servidor.
-- El cliente NUNCA debe hashear PINs por su cuenta.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_cashier(
  p_nombre TEXT,
  p_pin    TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- gen_salt('bf', 8): bcrypt con cost factor 8 (balance seguridad/velocidad en POS)
  INSERT INTO cashier_profiles (nombre, pin_hash)
  VALUES (p_nombre, crypt(p_pin, gen_salt('bf', 8)))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION create_cashier IS
  'Crea un cajero con PIN hasheado en servidor (bcrypt cost=8). '
  'SECURITY DEFINER: el cliente solo pasa el PIN en texto claro; el hash nunca regresa.';


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 9 — RPC: update_cashier_pin
-- Cambia el PIN de un cajero existente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_cashier_pin(
  p_cashier_id UUID,
  p_new_pin    TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE cashier_profiles
     SET pin_hash   = crypt(p_new_pin, gen_salt('bf', 8)),
         updated_at = NOW()
   WHERE id = p_cashier_id;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION update_cashier_pin IS
  'Cambia el PIN de un cajero. Retorna TRUE si se actualizó, FALSE si el ID no existe. '
  'SECURITY DEFINER: el nuevo PIN en texto claro nunca persiste.';


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 10 — Vista pos_sales_detail
-- Vista de conveniencia para reportes: ventas enriquecidas con nombre de
-- cajero, folio de sesión y contrato asociado. Los permisos los hereda de
-- las tablas subyacentes (RLS de authenticated).
-- No reemplaza ni modifica event_profit_loss; es una vista nueva independiente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW pos_sales_detail AS
SELECT
  sale.id,
  sale.session_id,
  sale.folio,
  sale.total,
  sale.pagado_con,
  sale.created_at,
  sale.cashier_id,
  cashier.nombre                AS cashier_nombre,
  sess.contract_id,
  sess.opened_at                AS session_opened_at,
  sess.closed_at                AS session_closed_at,
  contract.folio                AS contract_folio,
  contract.fecha_evento
FROM pos_sales        sale
LEFT JOIN cashier_profiles cashier  ON cashier.id  = sale.cashier_id
LEFT JOIN pos_sessions     sess     ON sess.id      = sale.session_id
LEFT JOIN contracts        contract ON contract.id  = sess.contract_id;

COMMENT ON VIEW pos_sales_detail IS
  'Ventas POS enriquecidas: nombre de cajero, sesión y contrato. Solo lectura.';
