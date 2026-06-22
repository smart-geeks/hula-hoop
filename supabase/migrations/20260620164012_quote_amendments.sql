-- 1. Nueva columna tipo en contract_payments
ALTER TABLE contract_payments
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'abono'
  CHECK (tipo IN ('anticipo', 'abono', 'liquidacion', 'extra'));

-- 2. Tabla quote_amendments
CREATE TABLE IF NOT EXISTS quote_amendments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id           UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  contract_id        UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected')),
  proposed_items     JSONB NOT NULL DEFAULT '[]',
  proposed_subtotal  INTEGER NOT NULL DEFAULT 0,
  proposed_descuento INTEGER NOT NULL DEFAULT 0,
  proposed_total     INTEGER NOT NULL DEFAULT 0,
  delta_monto        INTEGER NOT NULL DEFAULT 0,
  payment_id         UUID REFERENCES contract_payments(id),
  approval_token     TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  notas              TEXT,
  created_by         UUID REFERENCES profiles(id),
  approved_at        TIMESTAMPTZ,
  rejected_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. RLS
ALTER TABLE quote_amendments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage amendments"
  ON quote_amendments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Public read amendments"
  ON quote_amendments FOR SELECT
  USING (true);
