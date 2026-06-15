-- Add document columns to contracts table that are declared in TypeScript
-- but missing from the database schema.
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS firma_url        TEXT,
  ADD COLUMN IF NOT EXISTS ine_url          TEXT,
  ADD COLUMN IF NOT EXISTS comprobante_url  TEXT;
