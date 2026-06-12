-- ==============================================================================
-- Migration: 20260527000007_fix_trigger_id_generation.sql
-- Corrección de IDs nulos en triggers BEFORE INSERT
-- ==============================================================================

-- ── 1. Corregir fn_reservation_on_insert ─────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_reservation_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_quote_id  UUID;
  v_folio     TEXT;
  v_pkg_name  TEXT;
  v_pkg_price NUMERIC;
BEGIN
  -- ── Asegurar que NEW.id ya tenga un valor UUID ────────────────────────────
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  -- ── A. Buscar o registrar cliente por email ──────────────────────────────
  IF NEW.guest_email IS NOT NULL AND NEW.guest_email <> '' THEN
    SELECT id INTO v_client_id
    FROM clients
    WHERE email = NEW.guest_email
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    INSERT INTO clients (nombre, email, telefono)
    VALUES (NEW.guest_name, NEW.guest_email, NEW.guest_phone)
    RETURNING id INTO v_client_id;
  END IF;

  -- ── B. Si no viene vinculada con una cotización previa, crearla ────────────
  IF NEW.quote_id IS NULL THEN
    -- Generar folio de cotización: Q-YYYYMMDD-XXXXXX
    v_folio := 'Q-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(NEW.id::TEXT, 1, 6));
    WHILE EXISTS (SELECT 1 FROM quotes WHERE folio = v_folio) LOOP
      v_folio := 'Q-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 6));
    END LOOP;

    -- Insertar cotización borrador
    INSERT INTO quotes (
      folio,
      client_id,
      fecha,
      fecha_evento,
      estado,
      subtotal,
      total,
      notas,
      venue_id
    )
    VALUES (
      v_folio,
      v_client_id,
      CURRENT_DATE,
      NEW.reservation_date,
      'borrador',
      ROUND((NEW.subtotal_cents)::NUMERIC / 100.0, 2),
      ROUND((NEW.total_cents)::NUMERIC / 100.0, 2),
      COALESCE(NEW.notes, 'Cotización/reserva generada en línea'),
      NEW.venue_id
    )
    RETURNING id INTO v_quote_id;

    NEW.quote_id := v_quote_id;

    -- Registrar el paquete principal de la reserva como item de la cotización
    SELECT nombre, (precio_cents::NUMERIC / 100.0) INTO v_pkg_name, v_pkg_price 
    FROM packages 
    WHERE id = NEW.package_id;

    IF v_pkg_name IS NOT NULL THEN
      INSERT INTO quote_items (quote_id, descripcion, cantidad, precio_unitario)
      VALUES (v_quote_id, 'Paquete: ' || v_pkg_name, 1, v_pkg_price);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- ── 2. Corregir fn_reservation_confirmed_to_contract ─────────────────────────

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
  -- ── Asegurar que NEW.id ya tenga un valor UUID ────────────────────────────
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  -- ── A. Validar estatus confirmado ───────────────────────────────────────
  IF TG_OP = 'UPDATE' THEN
    -- Solo actuar si el estatus cambia a 'confirmed' desde otro valor
    IF NEW.status <> 'confirmed' OR OLD.status = 'confirmed' THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    -- Solo actuar si se inserta ya en estado 'confirmed'
    IF NEW.status <> 'confirmed' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ── B. Buscar o registrar cliente en CRM ─────────────────────────────────
  SELECT id INTO v_client_id
  FROM clients
  WHERE email = NEW.guest_email
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO clients (nombre, email, telefono)
    VALUES (NEW.guest_name, NEW.guest_email, NEW.guest_phone)
    RETURNING id INTO v_client_id;
  END IF;

  -- ── C. Marcar cotización como aprobada si existe ───────────────────────────
  IF NEW.quote_id IS NOT NULL THEN
    UPDATE quotes SET estado = 'aprobada' WHERE id = NEW.quote_id;
  END IF;

  -- ── D. Leer slot para hora inicio / fin ───────────────────────────────────
  SELECT * INTO v_slot FROM time_slots WHERE id = NEW.time_slot_id;

  -- ── E. Generar folio único de contrato ─────────────────────────────────────
  v_folio := 'C-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(NEW.id::TEXT, 1, 6));
  WHILE EXISTS (SELECT 1 FROM contracts WHERE folio = v_folio) LOOP
    v_folio := 'C-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 6));
  END LOOP;

  -- ── F. Crear contrato (el Evento) ─────────────────────────────────────────
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
    0, -- salon_renta base
    ROUND((NEW.total_cents)::NUMERIC / 100.0, 2),
    ROUND(COALESCE(NEW.paid_deposit_cents, 0)::NUMERIC / 100.0, 2),
    'borrador',
    'Generado automáticamente desde reserva ' || NEW.id::TEXT,
    NEW.venue_id
  )
  RETURNING id INTO v_contract_id;

  -- ── G. Registrar pago anticipo si ya se pagó algo ────────────────────────
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

  -- ── H. Vincular el contrato recién creado a la reserva ───────────────────
  NEW.contract_id := v_contract_id;

  RETURN NEW;
END;
$$;
