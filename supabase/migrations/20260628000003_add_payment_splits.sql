-- Add payment_splits JSONB to contract_payments and backfill
ALTER TABLE contract_payments
  ADD COLUMN IF NOT EXISTS payment_splits JSONB;

UPDATE contract_payments
SET payment_splits = jsonb_build_array(
  jsonb_build_object('metodo', metodo, 'monto', monto)
)
WHERE payment_splits IS NULL;

-- Add payment_splits JSONB to pos_sales and backfill
ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS payment_splits JSONB;

UPDATE pos_sales
SET payment_splits = jsonb_build_array(
  jsonb_build_object('metodo', pagado_con, 'monto', total)
)
WHERE payment_splits IS NULL;
