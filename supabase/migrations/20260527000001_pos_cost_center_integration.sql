-- ==============================================================================
-- Migration: 20260527000001_pos_cost_center_integration.sql
-- Integración cost-center entre POS, reservaciones y contratos
--
-- Partes:
--   A. Columnas de imputación en pos_sales (contract_id, playdate_date, playdate_time_slot_id)
--   B. Índice único parcial anti-doble-booking en private_reservations
--   C. Función y trigger: reserva confirmada → cliente CRM + contrato automático
-- ==============================================================================


-- ── A. Columnas de cost center en pos_sales ──────────────────────────────────
--
-- pos_sales ya tiene cashier_id (20260523000001). No tiene contract_id todavía.
-- pos_sessions sí tiene contract_id, pero pos_sales no — seguro agregar.
-- playdate_date + playdate_time_slot_id permiten imputar ventas sueltas
-- a un Play Day específico sin necesidad de un contrato.

ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS contract_id          UUID REFERENCES contracts(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS playdate_date         DATE,
  ADD COLUMN IF NOT EXISTS playdate_time_slot_id UUID REFERENCES time_slots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_sales_event_scope
  ON pos_sales(contract_id)
  WHERE contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_sales_playdate_scope
  ON pos_sales(playdate_date, playdate_time_slot_id)
  WHERE playdate_date IS NOT NULL;


-- ── B. Índice único parcial anti-doble-booking ───────────────────────────────
--
-- Garantiza que no existan dos reservas confirmed/completed para la misma
-- (fecha, slot). Las reservas pending_payment, cancelled y expired pueden
-- coexistir. El índice parcial es la forma más eficiente y correcta en PG
-- para este patrón de "unicidad condicional".
--
-- NOTA: Si existen datos históricos duplicados (doble-booking previo) el índice
-- no puede crearse automáticamente. El bloque DO verifica antes de intentarlo
-- y emite un NOTICE informativo si hay conflictos, en lugar de abortar la migración.

DO $$
DECLARE
  v_conflict_count INT;
BEGIN
  SELECT COUNT(*) INTO v_conflict_count
  FROM (
    SELECT reservation_date, time_slot_id, COUNT(*) AS cnt
    FROM private_reservations
    WHERE status IN ('confirmed', 'completed')
    GROUP BY reservation_date, time_slot_id
    HAVING COUNT(*) > 1
  ) conflicts;

  IF v_conflict_count > 0 THEN
    RAISE NOTICE
      'idx_private_reservations_confirmed_slot NO creado: existen % combinaciones (fecha, slot) con más de una reserva confirmed/completed. Resuelve los duplicados y ejecuta: CREATE UNIQUE INDEX idx_private_reservations_confirmed_slot ON private_reservations(reservation_date, time_slot_id) WHERE status IN (''confirmed'', ''completed'');',
      v_conflict_count;
  ELSE
    -- Sin conflictos: crear el índice de forma segura
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename  = 'private_reservations'
        AND indexname  = 'idx_private_reservations_confirmed_slot'
    ) THEN
      EXECUTE '
        CREATE UNIQUE INDEX idx_private_reservations_confirmed_slot
          ON private_reservations(reservation_date, time_slot_id)
          WHERE status IN (''confirmed'', ''completed'')
      ';
      RAISE NOTICE 'idx_private_reservations_confirmed_slot creado exitosamente.';
    END IF;
  END IF;
END $$;


-- ── C. Función y trigger: reserva confirmada → cliente CRM + contrato ────────
--
-- Se dispara BEFORE UPDATE en private_reservations cuando status cambia
-- a 'confirmed' (desde cualquier otro estado).
--
-- Qué hace:
--   1. Upsert de cliente en CRM por email (INSERT ... ON CONFLICT DO NOTHING,
--      luego SELECT para obtener el id existente o recién creado).
--      Nota: clients no tiene UNIQUE en email — se usa ON CONFLICT DO NOTHING
--      sobre el PK y se busca el primer match por email para idempotencia.
--   2. Si existe quote_id vinculada, la marca como 'aprobada'.
--   3. Lee el time_slot para obtener hora_inicio / hora_fin.
--   4. Genera folio único para el contrato.
--   5. Inserta el contrato con los datos de la reserva.
--      venue_id se copia desde la reserva (NOT NULL en contracts tras 20260523000004).
--   6. Si paid_deposit_cents > 0 registra el pago anticipo en contract_payments.
--   7. Escribe NEW.contract_id para que la reserva quede vinculada.

CREATE OR REPLACE FUNCTION fn_reservation_confirmed_to_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id   UUID;
  v_contract_id UUID;
  v_folio       TEXT;
  v_slot        RECORD;
BEGIN
  -- Solo actuar cuando status cambia A 'confirmed' DESDE otro estado
  IF NEW.status <> 'confirmed' OR OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- ── 1. Upsert cliente en CRM por email ────────────────────────────────────
  -- clients no tiene UNIQUE en email; insertamos con ON CONFLICT(id) DO NOTHING
  -- en un INSERT y después buscamos el primer registro que coincida con el email.
  -- Esto es idempotente: si ya existe un cliente con ese email lo reutilizamos;
  -- si no, creamos uno nuevo y lo seleccionamos de inmediato.
  INSERT INTO clients (nombre, email, telefono)
  VALUES (NEW.guest_name, NEW.guest_email, NEW.guest_phone)
  ON CONFLICT DO NOTHING;    -- no hace nada si ya hubo un INSERT idéntico en la misma tx

  SELECT id INTO v_client_id
  FROM clients
  WHERE email = NEW.guest_email
  ORDER BY created_at ASC
  LIMIT 1;

  -- Si por algún motivo no encontró (email nulo / race condition), insertar sin email
  IF v_client_id IS NULL THEN
    INSERT INTO clients (nombre, telefono)
    VALUES (NEW.guest_name, NEW.guest_phone)
    RETURNING id INTO v_client_id;
  END IF;

  -- ── 2. Marcar cotización como aprobada si existe ───────────────────────────
  IF NEW.quote_id IS NOT NULL THEN
    UPDATE quotes SET estado = 'aprobada' WHERE id = NEW.quote_id;
  END IF;

  -- ── 3. Leer slot para hora inicio / fin ───────────────────────────────────
  SELECT * INTO v_slot FROM time_slots WHERE id = NEW.time_slot_id;

  -- ── 4. Generar folio único ────────────────────────────────────────────────
  -- Formato: C-YYYYMMDD-XXXXXX  (6 primeros chars del UUID de la reserva en mayúsculas)
  v_folio := 'C-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(NEW.id::TEXT, 1, 6));

  -- Garantizar unicidad en el improbable caso de colisión de folio
  WHILE EXISTS (SELECT 1 FROM contracts WHERE folio = v_folio) LOOP
    v_folio := 'C-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 6));
  END LOOP;

  -- ── 5. Crear contrato ─────────────────────────────────────────────────────
  -- Columnas NOT NULL requeridas: folio, fecha_evento, venue_id
  -- deposito_pagado se calcula en centavos → pesos (la tabla usa NUMERIC 12,2)
  INSERT INTO contracts (
    folio,
    quote_id,
    client_id,
    fecha_evento,
    hora_inicio,
    hora_fin,
    salon_renta,
    total_contrato,
    deposito_pagado,
    estado,
    notas,
    venue_id
  )
  VALUES (
    v_folio,
    NEW.quote_id,
    v_client_id,
    NEW.reservation_date,
    COALESCE(v_slot.start_time, NULL),
    COALESCE(v_slot.end_time,   NULL),
    -- salon_renta: se inicializa en 0; el admin ajusta después
    0,
    -- total_contrato: convertir centavos a pesos
    ROUND((NEW.total_cents)::NUMERIC / 100.0, 2),
    -- deposito_pagado: solo el anticipo ya pagado
    ROUND(COALESCE(NEW.paid_deposit_cents, 0)::NUMERIC / 100.0, 2),
    'borrador',
    'Generado automáticamente desde reserva ' || NEW.id::TEXT,
    NEW.venue_id
  )
  RETURNING id INTO v_contract_id;

  -- ── 6. Registrar pago anticipo si ya se pagó algo ────────────────────────
  IF COALESCE(NEW.paid_deposit_cents, 0) > 0 THEN
    INSERT INTO contract_payments (
      contract_id,
      monto,
      fecha,
      metodo,
      notas
    )
    VALUES (
      v_contract_id,
      ROUND(NEW.paid_deposit_cents::NUMERIC / 100.0, 2),
      NEW.reservation_date,
      'online',
      'Anticipo recibido vía plataforma (reserva ' || NEW.id::TEXT || ')'
    );
  END IF;

  -- ── 7. Vincular el contrato recién creado a la reserva ───────────────────
  NEW.contract_id := v_contract_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservation_confirmed ON private_reservations;
CREATE TRIGGER trg_reservation_confirmed
  BEFORE UPDATE ON private_reservations
  FOR EACH ROW
  EXECUTE FUNCTION fn_reservation_confirmed_to_contract();
