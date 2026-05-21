-- Event Hub Schema Enhancements
-- 1. Add public_token to quotes for shareable read-only links
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS public_token uuid DEFAULT gen_random_uuid() NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotes_public_token_key'
  ) THEN
    ALTER TABLE quotes ADD CONSTRAINT quotes_public_token_key UNIQUE (public_token);
  END IF;
END $$;

-- 2. Link online reservations to their originating quote
ALTER TABLE private_reservations
  ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL;
