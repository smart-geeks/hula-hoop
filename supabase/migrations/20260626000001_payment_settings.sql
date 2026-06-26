-- Tabla de configuración de pasarela de pago por venue
CREATE TABLE payment_settings (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                  uuid        NOT NULL UNIQUE REFERENCES venues(id) ON DELETE CASCADE,
  mp_mode                   text        NOT NULL DEFAULT 'sandbox'
                              CHECK (mp_mode IN ('sandbox', 'production')),
  mp_sandbox_access_token   text,
  mp_sandbox_webhook_secret text,
  mp_prod_access_token      text,
  mp_prod_webhook_secret    text,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid        REFERENCES auth.users(id)
);

ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;

-- Solo owners y admins del venue pueden leer o escribir
-- user_is_manager_of() ya existe: verifica role IN ('owner','admin') en venue_users
CREATE POLICY "payment_settings_manager" ON payment_settings
  FOR ALL TO authenticated
  USING     (user_is_manager_of(venue_id))
  WITH CHECK (user_is_manager_of(venue_id));

-- Seed: crear una fila vacía por cada venue ya existente
INSERT INTO payment_settings (venue_id)
SELECT id FROM venues
ON CONFLICT (venue_id) DO NOTHING;
