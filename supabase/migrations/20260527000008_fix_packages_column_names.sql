-- ==============================================================================
-- Migration: 20260527000008_fix_packages_column_names.sql
-- Corrección de nombres de columnas de packages en trigger de reserva
-- ==============================================================================

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
    -- Corregido: 'name' y 'price_cents' en la tabla 'packages'
    SELECT name, (price_cents::NUMERIC / 100.0) INTO v_pkg_name, v_pkg_price 
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
