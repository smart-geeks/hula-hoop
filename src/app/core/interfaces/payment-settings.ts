export type MpMode = 'sandbox' | 'production';

export interface PaymentSettings {
  id: string;
  venue_id: string;
  mp_mode: MpMode;
  mp_sandbox_access_token:   string | null;
  mp_sandbox_webhook_secret: string | null;
  mp_prod_access_token:      string | null;
  mp_prod_webhook_secret:    string | null;
  updated_at: string;
  updated_by: string | null;
}

/** Lo que el componente ve: valores enmascarados, nunca el token real */
export interface MaskedPaymentSettings extends Omit<PaymentSettings,
  'mp_sandbox_access_token' | 'mp_sandbox_webhook_secret' |
  'mp_prod_access_token'    | 'mp_prod_webhook_secret'> {
  mp_sandbox_access_token_masked:   string | null;
  mp_sandbox_webhook_secret_masked: string | null;
  mp_prod_access_token_masked:      string | null;
  mp_prod_webhook_secret_masked:    string | null;
}

/** Payload de guardado — solo los campos que el usuario modificó */
export interface PaymentSettingsUpdate {
  mp_mode?:                   MpMode;
  mp_sandbox_access_token?:   string;
  mp_sandbox_webhook_secret?: string;
  mp_prod_access_token?:      string;
  mp_prod_webhook_secret?:    string;
  updated_by:                 string;
  updated_at:                 string;
}
