-- ==============================================================================
-- Migration: 20260527000010_public_quotes_rls.sql
-- Habilita lectura selectiva pública para cotizaciones, items y clientes
-- para que los visitantes anónimos puedan descargar y ver cotizaciones.
-- ==============================================================================

-- ── 1. RLS para quotes (Lectura pública selectiva) ──────────────────────────
DROP POLICY IF EXISTS "quotes_public_read" ON quotes;
CREATE POLICY "quotes_public_read" ON quotes
  FOR SELECT TO anon, authenticated
  USING (public_token IS NOT NULL);

-- ── 2. RLS para quote_items (Lectura pública selectiva) ─────────────────────
DROP POLICY IF EXISTS "quote_items_public_read" ON quote_items;
CREATE POLICY "quote_items_public_read" ON quote_items
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quotes
      WHERE quotes.id = quote_items.quote_id
        AND quotes.public_token IS NOT NULL
    )
  );

-- ── 3. RLS para clients (Lectura pública selectiva) ─────────────────────────
DROP POLICY IF EXISTS "clients_public_read" ON clients;
CREATE POLICY "clients_public_read" ON clients
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quotes
      WHERE quotes.client_id = clients.id
        AND quotes.public_token IS NOT NULL
    )
  );
