-- Add wizard-flow fields to quotes table
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS hora_inicio   varchar,
  ADD COLUMN IF NOT EXISTS hora_fin      varchar,
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS guest_count   integer;
