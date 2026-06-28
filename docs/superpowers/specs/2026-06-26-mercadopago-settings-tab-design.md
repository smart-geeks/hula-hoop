# Spec: Pestaña "Pagos" — Configuración de Mercado Pago

**Fecha:** 2026-06-26  
**Estado:** Aprobado para implementación

---

## Contexto

Las credenciales de Mercado Pago (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`) viven actualmente como variables de entorno en los Supabase Edge Function Secrets. El admin no puede cambiarlas sin acceso técnico al dashboard de Supabase. Este feature mueve esas credenciales a una tabla de base de datos con RLS estricta, exponiendo una UI funcional dentro de la pantalla de Configuración del admin.

---

## Alcance

- Nueva tabla `payment_settings` en Supabase
- Nuevo servicio Angular `PaymentSettingsService`
- Nueva pestaña "Pagos" en `AdminConfig` (pestaña #5, junto a General, Cajeros, Categorías, Impresora)
- Actualización de ambas edge functions para leer credenciales desde DB en lugar de env vars
- Fallback a env vars para compatibilidad mientras se migra

### Fuera de alcance
- Public Key de MP (no se usa en ninguna edge function actual)
- Otros proveedores de pago
- Encriptación a nivel de columna (pgcrypto / Vault)

---

## Base de Datos

### Tabla `payment_settings`

```sql
CREATE TABLE payment_settings (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                  uuid NOT NULL UNIQUE REFERENCES venues(id) ON DELETE CASCADE,
  mp_mode                   text NOT NULL DEFAULT 'sandbox'
                              CHECK (mp_mode IN ('sandbox', 'production')),
  mp_sandbox_access_token   text,
  mp_sandbox_webhook_secret text,
  mp_prod_access_token      text,
  mp_prod_webhook_secret    text,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid REFERENCES auth.users(id)
);

ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_settings_manager" ON payment_settings
  FOR ALL TO authenticated
  USING     (user_is_manager_of(venue_id))
  WITH CHECK (user_is_manager_of(venue_id));

-- Seed: una fila por venue ya existente
INSERT INTO payment_settings (venue_id)
SELECT id FROM venues
ON CONFLICT (venue_id) DO NOTHING;
```

### RLS

Usa `user_is_manager_of(venue_id)` — la función `SECURITY DEFINER` ya existente que verifica que el usuario autenticado tenga `role IN ('owner', 'admin')` en `venue_users`. No se crea ninguna función nueva.

Las edge functions usan la `SUPABASE_SERVICE_ROLE_KEY` que bypassa RLS, por lo que pueden leer la fila sin restricciones.

---

## Interface TypeScript

```typescript
// src/app/core/interfaces/payment-settings.ts

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

/** Lo que el componente ve: tokens enmascarados, nunca el valor real */
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
}
```

---

## Servicio Angular `PaymentSettingsService`

**Archivo:** `src/app/core/services/payment-settings.service.ts`

### Responsabilidades

- `getSettings(): Promise<MaskedPaymentSettings | null>` — lee de DB y aplica mascara antes de retornar al componente
- `saveSettings(id, changes): Promise<boolean>` — hace UPDATE solo con los campos que cambiaron
- `getWebhookUrl(): string` — construye la URL del webhook a partir de la URL base del cliente Supabase
- `generateSecret(): string` — genera un UUID v4 aleatorio para usar como webhook secret

### Lógica de enmascarado

```typescript
private maskToken(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return '••••';
  return '•'.repeat(Math.min(value.length - 4, 20)) + value.slice(-4);
}
```

El componente recibe solo valores enmascarados. Nunca almacena ni muestra el token real.

### Lógica de guardado — detección de campos modificados

Un campo se considera **modificado** si su valor nuevo **no empieza con `•`** (el usuario escribió algo nuevo). Si el campo sigue mostrando la máscara, no se incluye en el payload de UPDATE.

```typescript
// En el componente, al preparar el payload:
if (!accessToken.startsWith('•')) {
  changes.mp_prod_access_token = accessToken;
}
```

---

## Componente UI — Pestaña "Pagos"

### Cambios en `AdminConfig`

1. Agregar `'pagos'` al tipo del signal `activeTab`
2. Agregar el tab al array de tabs en el HTML
3. Agregar las señales y el método de carga en el constructor
4. Agregar el contenido de la pestaña en el HTML

### Estructura visual de la pestaña

```
┌─────────────────────────────────────────────────────────┐
│  Pasarela de Pagos                                      │
│  Configura las credenciales de Mercado Pago             │
│                                                         │
│  ┌── Entorno ──────────────────────────────────────┐   │
│  │  [ SANDBOX – PRUEBAS ]   [ PRODUCCIÓN ]         │   │
│  │  ⚠ Las transacciones no serán reales...         │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌── Credenciales ─────────────────────────────────┐   │
│  │  Encuéntralas en mercadopago.com → Tu negocio   │   │
│  │  → Credenciales                                  │   │
│  │                                                  │   │
│  │  ACCESS TOKEN                                    │   │
│  │  [••••••••••••••••••••••TeSj] [👁]              │   │
│  │                                                  │   │
│  │  WEBHOOK URL (solo lectura)                      │   │
│  │  [https://xxx.supabase.co/functions/v1/...] [⎘] │   │
│  │  ℹ Pega esta URL en Mercado Pago →              │   │
│  │    Tu negocio → Webhooks                         │   │
│  │                                                  │   │
│  │  WEBHOOK SECRET (opcional)                       │   │
│  │  [••••••••••••••••••••••abc1] [👁] [⟳ Generar] │   │
│  │  ℹ Cópialo y pégalo en Mercado Pago junto       │   │
│  │    a la URL del webhook                          │   │
│  │                                                  │   │
│  │  [ Guardar credenciales ]                        │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Signals del componente (solo los nuevos)

```typescript
readonly paymentSettings   = signal<MaskedPaymentSettings | null>(null);
readonly paymentLoading    = signal(false);
readonly paymentSaving     = signal(false);

// Valores editables — inicializados con la máscara al cargar
readonly mpAccessToken     = signal('');
readonly mpWebhookSecret   = signal('');

// Visibilidad de campos sensibles
readonly showAccessToken   = signal(false);
readonly showWebhookSecret = signal(false);
```

### Comportamiento del toggle Sandbox / Producción

- Cambiar el toggle **guarda inmediatamente** solo `mp_mode` en DB (sin afectar las credenciales)
- Actualiza qué credenciales muestra (sandbox vs prod)
- El banner contextual cambia: naranja en Sandbox, verde en Producción

### Campo Access Token — comportamiento del ojo

- Ojo cerrado por defecto: el campo es `type="password"` y muestra la máscara
- Al hacer clic en el ojo, el campo cambia a `type="text"` y muestra la máscara (no el valor real, porque el componente nunca lo tuvo)
- El propósito del ojo es ver los últimos 4 chars sin que los asteriscos confundan

---

## Actualización de Edge Functions

### Patrón común (aplicar en `create-payment` y `mp-webhook`)

```typescript
// Al inicio del handler, después de crear supabaseAdmin:
const { data: ps } = await supabaseAdmin
  .from('payment_settings')
  .select('mp_mode, mp_sandbox_access_token, mp_prod_access_token, mp_sandbox_webhook_secret, mp_prod_webhook_secret')
  .limit(1)  // hay una sola fila global por venue (el venue se determina por contexto)
  .maybeSingle()

const isProduction = ps?.mp_mode === 'production'

const mpAccessToken =
  (isProduction ? ps?.mp_prod_access_token : ps?.mp_sandbox_access_token)
  ?? Deno.env.get('MP_ACCESS_TOKEN')  // fallback para compatibilidad

const mpWebhookSecret =
  (isProduction ? ps?.mp_prod_webhook_secret : ps?.mp_sandbox_webhook_secret)
  ?? Deno.env.get('MP_WEBHOOK_SECRET')
```

> **Nota sobre venue_id en edge functions:** Actualmente las edge functions no reciben `venue_id` como parámetro explícito. Como hay un solo venue por instalación en la mayoría de los casos, el `.limit(1).maybeSingle()` es suficiente. Si en el futuro hay multi-venue, se deberá pasar `venue_id` en el request body.

---

## Flujo completo del admin

1. Admin abre Configuración → pestaña "Pagos"
2. Ve el toggle en Sandbox (default) con banner naranja de advertencia
3. Cambia a Producción → toggle se activa, banner cambia a verde
4. Pega su `MP_ACCESS_TOKEN` de producción en el campo
5. Copia la Webhook URL y la pega en el dashboard de Mercado Pago
6. Hace clic en "Generar" para el Webhook Secret → se genera un UUID
7. Copia ese UUID y lo pega en Mercado Pago junto a la webhook URL
8. Guarda → toast de éxito
9. Siguiente vez que abre la pestaña, ve `••••••••••••••••••••TeSj` en Access Token — confirma que está configurado

---

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `supabase/migrations/YYYYMMDD_payment_settings.sql` | Crear |
| `src/app/core/interfaces/payment-settings.ts` | Crear |
| `src/app/core/services/payment-settings.service.ts` | Crear |
| `src/app/features/admin/pages/admin-config/admin-config.ts` | Modificar |
| `src/app/features/admin/pages/admin-config/admin-config.html` | Modificar |
| `supabase/functions/create-payment/index.ts` | Modificar |
| `supabase/functions/mp-webhook/index.ts` | Modificar |

---

## Decisiones de seguridad

- Los tokens **nunca se muestran completos** en la UI — solo los últimos 4 caracteres
- El servicio Angular aplica la máscara **antes de asignar al signal** — el token real nunca vive en el estado del componente
- La RLS usa `user_is_manager_of()` con `SECURITY DEFINER` — no hay riesgo de recursión ni de bypass accidental
- Las edge functions siguen usando `SUPABASE_SERVICE_ROLE_KEY` (env var de Supabase, nunca en DB) para leer la tabla
- Si no hay fila en `payment_settings` (venue nuevo), el fallback a `Deno.env` mantiene el sistema funcionando
