-- Add representative signature URL to contracts
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS firma_representante_url TEXT;
