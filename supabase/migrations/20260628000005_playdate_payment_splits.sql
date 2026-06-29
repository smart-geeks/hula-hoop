-- Add payment method tracking to playdate_reservations
ALTER TABLE playdate_reservations
  ADD COLUMN IF NOT EXISTS metodo        TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_splits JSONB  DEFAULT NULL;
