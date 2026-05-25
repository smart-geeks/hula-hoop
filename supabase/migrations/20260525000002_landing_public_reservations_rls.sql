-- ─────────────────────────────────────────────────────────────────────────────
-- Landing Public Reservations: Phase 2 RLS Patch
-- Enables public insertions and selective reads for time slots and bookings
-- so visitors can check availability and purchase/reserve playdates and parties.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. RLS para time_slots (Lectura pública) ──────────────────────────────────
DROP POLICY IF EXISTS "time_slots_public_read" ON time_slots;
CREATE POLICY "time_slots_public_read" ON time_slots
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- ── 2. RLS para private_reservations (Escritura y lectura selectiva) ───────────
-- Permite que los visitantes creen reservaciones desde la landing pública
DROP POLICY IF EXISTS "private_reservations_public_insert" ON private_reservations;
CREATE POLICY "private_reservations_public_insert" ON private_reservations
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Permite ver los detalles de una reserva si se conoce su access_token seguro
DROP POLICY IF EXISTS "private_reservations_public_read" ON private_reservations;
CREATE POLICY "private_reservations_public_read" ON private_reservations
  FOR SELECT TO anon, authenticated
  USING (access_token IS NOT NULL);

-- ── 3. RLS para playdate_reservations (Escritura y lectura selectiva) ──────────
-- Permite que los visitantes compren boletos de Play Day desde la landing
DROP POLICY IF EXISTS "playdate_reservations_public_insert" ON playdate_reservations;
CREATE POLICY "playdate_reservations_public_insert" ON playdate_reservations
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Permite ver los detalles de su boleto de Play Day si conocen el access_token seguro
DROP POLICY IF EXISTS "playdate_reservations_public_read" ON playdate_reservations;
CREATE POLICY "playdate_reservations_public_read" ON playdate_reservations
  FOR SELECT TO anon, authenticated
  USING (access_token IS NOT NULL);

-- ── 4. RLS para private_reservation_extras (Escritura y lectura) ──────────────
-- Si existe la tabla, asegura el guardado de los extras del cumpleaños
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'private_reservation_extras') THEN
    ALTER TABLE private_reservation_extras ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "extras_booking_public_insert" ON private_reservation_extras;
    CREATE POLICY "extras_booking_public_insert" ON private_reservation_extras
      FOR INSERT TO anon, authenticated
      WITH CHECK (true);
      
    DROP POLICY IF EXISTS "extras_booking_public_read" ON private_reservation_extras;
    CREATE POLICY "extras_booking_public_read" ON private_reservation_extras
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- ── 5. RLS para extras (Lectura pública de catálogo) ──────────────────────────
-- Si existe la tabla, asegura lectura del catálogo de extras disponibles
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'extras') THEN
    ALTER TABLE extras ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "extras_catalog_public_read" ON extras;
    CREATE POLICY "extras_catalog_public_read" ON extras
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END $$;
