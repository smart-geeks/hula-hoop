# Pestaña "Pagos" — Configuración de Mercado Pago — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear una pestaña "Pagos" en la pantalla de Configuración del admin que permita guardar credenciales de Mercado Pago (Access Token y Webhook Secret) en base de datos, con toggle Sandbox/Producción, sin exponer el token completo en la UI.

**Architecture:** Nueva tabla `payment_settings` con RLS basada en `user_is_manager_of()`. Servicio Angular que enmascara tokens antes de exponerlos al componente. Las dos edge functions (`create-payment`, `mp-webhook`) leen credenciales desde DB con fallback a `Deno.env` para compatibilidad.

**Tech Stack:** Angular 20+ (signals, zoneless, OnPush), PrimeNG, Supabase (PostgreSQL + Edge Functions Deno), TypeScript strict.

## Global Constraints

- No `standalone: true` en decoradores Angular (es default en v20+)
- No `NgZone`, no `ChangeDetectorRef` — proyecto zoneless
- No `async ngOnInit()` — carga de datos en `constructor()` con método privado async
- No 4to parámetro de locale en pipes de moneda (`'es-MX'` ya es global)
- No `ngClass`/`ngStyle` — usar bindings `[class]`/`[style]`
- Siempre templates externos `.html`, nunca inline
- `changeDetection: ChangeDetectionStrategy.OnPush` en todo componente
- URL de Supabase: `https://jzdfxbbnhkzdetrpmqdx.supabase.co`
- Webhook URL fija: `https://jzdfxbbnhkzdetrpmqdx.supabase.co/functions/v1/mp-webhook`

---

## File Map

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/20260626000001_payment_settings.sql` | Crear | Tabla, RLS, seed |
| `src/app/core/interfaces/payment-settings.ts` | Crear | Tipos TypeScript |
| `src/app/core/services/payment-settings.service.ts` | Crear | CRUD + masking + helpers |
| `src/app/features/admin/pages/admin-config/admin-config.ts` | Modificar | Signals + métodos de la pestaña Pagos |
| `src/app/features/admin/pages/admin-config/admin-config.html` | Modificar | UI de la pestaña Pagos |
| `supabase/functions/create-payment/index.ts` | Modificar | Leer token desde DB |
| `supabase/functions/mp-webhook/index.ts` | Modificar | Leer token y secret desde DB |

---

## Task 1: Migración SQL e Interface TypeScript

**Files:**
- Create: `supabase/migrations/20260626000001_payment_settings.sql`
- Create: `src/app/core/interfaces/payment-settings.ts`

**Interfaces:**
- Produces: tipos `PaymentSettings`, `MaskedPaymentSettings`, `PaymentSettingsUpdate`, `MpMode` — usados por Task 2 y Task 3

---

- [ ] **Step 1: Crear el archivo de migración**

Crear `supabase/migrations/20260626000001_payment_settings.sql` con este contenido exacto:

```sql
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
```

- [ ] **Step 2: Aplicar la migración en Supabase**

```bash
cd /home/eduardo/Proyectos/hula-hoop
supabase db push
```

Resultado esperado: `Applying migration 20260626000001_payment_settings.sql` sin errores.

- [ ] **Step 3: Verificar en el dashboard de Supabase**

Abrir Table Editor en Supabase → verificar que existe la tabla `payment_settings` con una fila por cada venue existente, todos los campos de token en NULL, y `mp_mode = 'sandbox'`.

- [ ] **Step 4: Crear el interface TypeScript**

Crear `src/app/core/interfaces/payment-settings.ts`:

```typescript
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
export interface MaskedPaymentSettings {
  id: string;
  venue_id: string;
  mp_mode: MpMode;
  mp_sandbox_access_token_masked:   string | null;
  mp_sandbox_webhook_secret_masked: string | null;
  mp_prod_access_token_masked:      string | null;
  mp_prod_webhook_secret_masked:    string | null;
  updated_at: string;
  updated_by: string | null;
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
```

- [ ] **Step 5: Verificar compilación TypeScript**

```bash
cd /home/eduardo/Proyectos/hula-hoop
npx tsc --noEmit
```

Resultado esperado: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260626000001_payment_settings.sql \
        src/app/core/interfaces/payment-settings.ts
git commit -m "feat: add payment_settings table and TypeScript interfaces"
```

---

## Task 2: PaymentSettingsService

**Files:**
- Create: `src/app/core/services/payment-settings.service.ts`

**Interfaces:**
- Consumes: `MaskedPaymentSettings`, `PaymentSettingsUpdate`, `MpMode` de `src/app/core/interfaces/payment-settings.ts`
- Consumes: `SupabaseService` (inyectable, `.client` devuelve `SupabaseClient | null`)
- Consumes: `VenueService` (inyectable, `.currentVenueId()` devuelve `string | null`)
- Consumes: `environment.supabaseUrl` desde `src/environments/environment.ts`
- Produces:
  - `webhookUrl: string` (propiedad readonly)
  - `getSettings(): Promise<MaskedPaymentSettings | null>`
  - `saveMode(id, mode, updatedBy): Promise<boolean>`
  - `saveCredentials(id, changes): Promise<boolean>`
  - `generateSecret(): string`

---

- [ ] **Step 1: Crear el servicio**

Crear `src/app/core/services/payment-settings.service.ts`:

```typescript
import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { VenueService } from './venue.service';
import { environment } from '../../../environments/environment';
import type { MaskedPaymentSettings, MpMode, PaymentSettings, PaymentSettingsUpdate } from '../interfaces/payment-settings';

@Injectable({ providedIn: 'root' })
export class PaymentSettingsService {
  private readonly supabase = inject(SupabaseService);
  private readonly venue    = inject(VenueService);

  readonly webhookUrl = `${environment.supabaseUrl}/functions/v1/mp-webhook`;

  async getSettings(): Promise<MaskedPaymentSettings | null> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return null;

    const { data, error } = await client
      .from('payment_settings')
      .select('*')
      .eq('venue_id', venueId)
      .single();

    if (error) {
      console.error('Error fetching payment settings:', error.message);
      return null;
    }

    const d = data as PaymentSettings;
    return {
      id:         d.id,
      venue_id:   d.venue_id,
      mp_mode:    d.mp_mode,
      mp_sandbox_access_token_masked:   this.maskToken(d.mp_sandbox_access_token),
      mp_sandbox_webhook_secret_masked: this.maskToken(d.mp_sandbox_webhook_secret),
      mp_prod_access_token_masked:      this.maskToken(d.mp_prod_access_token),
      mp_prod_webhook_secret_masked:    this.maskToken(d.mp_prod_webhook_secret),
      updated_at: d.updated_at,
      updated_by: d.updated_by,
    };
  }

  async saveMode(id: string, mode: MpMode, updatedBy: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('payment_settings')
      .update({ mp_mode: mode, updated_by: updatedBy, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error saving mode:', error.message);
      return false;
    }
    return true;
  }

  async saveCredentials(id: string, changes: PaymentSettingsUpdate): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('payment_settings')
      .update(changes)
      .eq('id', id);

    if (error) {
      console.error('Error saving credentials:', error.message);
      return false;
    }
    return true;
  }

  generateSecret(): string {
    return crypto.randomUUID();
  }

  private maskToken(value: string | null): string | null {
    if (!value) return null;
    if (value.length <= 4) return '••••';
    return '•'.repeat(Math.min(value.length - 4, 20)) + value.slice(-4);
  }
}
```

- [ ] **Step 2: Verificar compilación**

```bash
cd /home/eduardo/Proyectos/hula-hoop
npx tsc --noEmit
```

Resultado esperado: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/payment-settings.service.ts
git commit -m "feat: add PaymentSettingsService with masking and CRUD"
```

---

## Task 3: Pestaña "Pagos" en AdminConfig

**Files:**
- Modify: `src/app/features/admin/pages/admin-config/admin-config.ts`
- Modify: `src/app/features/admin/pages/admin-config/admin-config.html`

**Interfaces:**
- Consumes: `PaymentSettingsService` (Task 2) — `getSettings()`, `saveMode()`, `saveCredentials()`, `generateSecret()`, `webhookUrl`
- Consumes: `MaskedPaymentSettings`, `MpMode`, `PaymentSettingsUpdate` de `payment-settings.ts` (Task 1)
- Consumes: `AuthService` (ya inyectado) — `.currentUser()?.id`
- Consumes: `MessageService` (ya inyectado) — `.add()`

---

- [ ] **Step 1: Modificar `admin-config.ts` — importar y ampliar tipos**

En `src/app/features/admin/pages/admin-config/admin-config.ts`:

Agregar el import del servicio y los tipos (añadir a los imports existentes):

```typescript
import { PaymentSettingsService } from '../../../../core/services/payment-settings.service';
import type { MaskedPaymentSettings, MpMode, PaymentSettingsUpdate } from '../../../../core/interfaces/payment-settings';
```

Cambiar la línea del tipo de `activeTab` (buscar la línea que dice `signal<'general' | 'cajeros' | 'categorias' | 'impresora'>`):

```typescript
// ANTES:
readonly activeTab = signal<'general' | 'cajeros' | 'categorias' | 'impresora'>('general');

setTab(tab: 'general' | 'cajeros' | 'categorias' | 'impresora'): void {
// DESPUÉS:
readonly activeTab = signal<'general' | 'cajeros' | 'categorias' | 'impresora' | 'pagos'>('general');

setTab(tab: 'general' | 'cajeros' | 'categorias' | 'impresora' | 'pagos'): void {
```

- [ ] **Step 2: Agregar inyección y signals de la pestaña Pagos**

Dentro de la clase `AdminConfig`, después de la sección `// ── Impresora`, añadir:

```typescript
  private readonly paymentSettingsService = inject(PaymentSettingsService);

  // ── Pagos ──────────────────────────────────────────────────
  readonly paymentSettings   = signal<MaskedPaymentSettings | null>(null);
  readonly paymentLoading    = signal(false);
  readonly paymentSaving     = signal(false);
  readonly mpAccessToken     = signal('');
  readonly mpWebhookSecret   = signal('');
  readonly showAccessToken   = signal(false);
  readonly showWebhookSecret = signal(false);

  readonly webhookUrl = this.paymentSettingsService.webhookUrl;

  readonly activeTokenMasked = computed(() => {
    const s = this.paymentSettings();
    if (!s) return null;
    return s.mp_mode === 'production'
      ? s.mp_prod_access_token_masked
      : s.mp_sandbox_access_token_masked;
  });

  readonly activeSecretMasked = computed(() => {
    const s = this.paymentSettings();
    if (!s) return null;
    return s.mp_mode === 'production'
      ? s.mp_prod_webhook_secret_masked
      : s.mp_sandbox_webhook_secret_masked;
  });
```

- [ ] **Step 3: Añadir `loadPaymentSettings()` al constructor y a los métodos**

En el `constructor()`, dentro del `effect()`, añadir la llamada después de `this.loadCashiers()`:

```typescript
  constructor() {
    effect(() => {
      const venueId = this.venueService.currentVenueId();
      if (venueId) {
        this.loadConfig();
        this.loadCashiers();
        this.loadPaymentSettings(); // ← AÑADIR
      } else {
        this.loading.set(false);
      }
    });
    this.loadCategories();
  }
```

Después de `savePrinterConfig()`, añadir los métodos de pagos:

```typescript
  // ── Pagos ──────────────────────────────────────────────────

  async loadPaymentSettings(): Promise<void> {
    this.paymentLoading.set(true);
    const data = await this.paymentSettingsService.getSettings();
    this.paymentSettings.set(data);
    this.mpAccessToken.set('');
    this.mpWebhookSecret.set('');
    this.paymentLoading.set(false);
  }

  async setMode(mode: MpMode): Promise<void> {
    const settings = this.paymentSettings();
    const userId   = this.authService.currentUser()?.id;
    if (!settings || !userId || settings.mp_mode === mode) return;

    this.paymentSaving.set(true);
    const ok = await this.paymentSettingsService.saveMode(settings.id, mode, userId);
    if (ok) {
      this.paymentSettings.update(s => s ? { ...s, mp_mode: mode } : s);
      this.mpAccessToken.set('');
      this.mpWebhookSecret.set('');
      this.showAccessToken.set(false);
      this.showWebhookSecret.set(false);
    } else {
      this.messageService.add({ severity: 'error', summary: 'No se pudo cambiar el entorno' });
    }
    this.paymentSaving.set(false);
  }

  async savePaymentCredentials(): Promise<void> {
    const settings = this.paymentSettings();
    const userId   = this.authService.currentUser()?.id;
    if (!settings || !userId) return;

    const isProduction = settings.mp_mode === 'production';
    const changes: PaymentSettingsUpdate = {
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };

    const token  = this.mpAccessToken().trim();
    const secret = this.mpWebhookSecret().trim();

    if (token && !token.startsWith('•')) {
      if (isProduction) changes.mp_prod_access_token   = token;
      else              changes.mp_sandbox_access_token = token;
    }

    if (secret && !secret.startsWith('•')) {
      if (isProduction) changes.mp_prod_webhook_secret   = secret;
      else              changes.mp_sandbox_webhook_secret = secret;
    }

    if (Object.keys(changes).length === 2) {
      // Solo updated_by y updated_at — nada que guardar
      this.messageService.add({ severity: 'warn', summary: 'No hay credenciales nuevas para guardar' });
      return;
    }

    this.paymentSaving.set(true);
    const ok = await this.paymentSettingsService.saveCredentials(settings.id, changes);
    if (ok) {
      await this.loadPaymentSettings();
      this.messageService.add({ severity: 'success', summary: 'Credenciales guardadas' });
    } else {
      this.messageService.add({ severity: 'error', summary: 'Error al guardar credenciales' });
    }
    this.paymentSaving.set(false);
  }

  generateAndSetSecret(): void {
    this.mpWebhookSecret.set(this.paymentSettingsService.generateSecret());
    this.showWebhookSecret.set(true);
  }

  copyWebhookUrl(): void {
    navigator.clipboard.writeText(this.webhookUrl).then(() => {
      this.messageService.add({ severity: 'info', summary: 'URL copiada al portapapeles' });
    });
  }
```

- [ ] **Step 4: Verificar compilación TypeScript**

```bash
cd /home/eduardo/Proyectos/hula-hoop
npx tsc --noEmit
```

Resultado esperado: 0 errores.

- [ ] **Step 5: Agregar la pestaña al tab bar en el HTML**

En `src/app/features/admin/pages/admin-config/admin-config.html`, localizar el array de tabs en el `@for`:

```html
<!-- ANTES — el array termina en: -->
    {id: 'impresora',  icon: 'pi-print',     label: 'Impresora'}

<!-- DESPUÉS — agregar una entrada más al array: -->
    {id: 'impresora',  icon: 'pi-print',     label: 'Impresora'},
    {id: 'pagos',      icon: 'pi-credit-card', label: 'Pagos'}
```

- [ ] **Step 6: Agregar el contenido de la pestaña Pagos en el HTML**

Al final del bloque `@else` que contiene los tabs (después del bloque `@if (activeTab() === 'impresora')` y antes del cierre `}`), añadir:

```html
  <!-- ── TAB CONTENT: PAGOS ───────────────────────────── -->
  @if (activeTab() === 'pagos') {
    <div class="max-w-lg animate-fade-in">

      <!-- Entorno -->
      <div class="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
        <h2 class="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Entorno</h2>
        <div class="grid grid-cols-2 gap-2 mb-3">
          @for (opt of [['sandbox','Sandbox – Pruebas'],['production','Producción']]; track opt[0]) {
            <button (click)="setMode($any(opt[0]))"
              [disabled]="paymentSaving() || paymentLoading()"
              [class]="'py-2.5 rounded-xl border text-sm font-semibold transition-all disabled:opacity-50 '
                + (paymentSettings()?.mp_mode === opt[0]
                  ? (opt[0] === 'sandbox'
                    ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                    : 'bg-emerald-600 text-white border-emerald-600 shadow-sm')
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50')">
              {{ opt[1] }}
            </button>
          }
        </div>
        @if (paymentSettings()?.mp_mode === 'sandbox') {
          <p class="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <i class="pi pi-exclamation-triangle shrink-0"></i>
            Las transacciones no serán reales. Usa credenciales de prueba de Mercado Pago.
          </p>
        } @else if (paymentSettings()?.mp_mode === 'production') {
          <p class="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <i class="pi pi-check-circle shrink-0"></i>
            Modo producción activo. Los cobros son reales.
          </p>
        }
      </div>

      <!-- Credenciales -->
      @if (paymentLoading()) {
        <div class="flex justify-center py-8">
          <div class="w-6 h-6 border-2 border-rojo-brillante border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else if (paymentSettings()) {
        <div class="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
          <div>
            <h2 class="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Credenciales MercadoPago</h2>
            <p class="text-xs text-slate-400">Encuéntralas en mercadopago.com → Tu negocio → Credenciales.</p>
          </div>

          <!-- Access Token -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Access Token
              <span class="ml-1 font-normal normal-case text-slate-400">
                ({{ paymentSettings()!.mp_mode === 'sandbox' ? 'Sandbox' : 'Producción' }})
              </span>
            </label>
            <div class="flex gap-2">
              <input
                [type]="showAccessToken() ? 'text' : 'password'"
                placeholder="Pegar nuevo Access Token..."
                [value]="mpAccessToken()"
                (input)="mpAccessToken.set($any($event.target).value)"
                class="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rojo-brillante/30 focus:border-rojo-brillante transition-all" />
              <button (click)="showAccessToken.set(!showAccessToken())"
                class="px-3 border border-slate-200 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                [title]="showAccessToken() ? 'Ocultar' : 'Mostrar'">
                <i [class]="'pi text-sm ' + (showAccessToken() ? 'pi-eye-slash' : 'pi-eye')"></i>
              </button>
            </div>
            @if (activeTokenMasked()) {
              <p class="text-xs text-slate-400 mt-1.5">
                Configurado: <span class="font-mono tracking-wider">{{ activeTokenMasked() }}</span>
              </p>
            } @else {
              <p class="text-xs text-amber-600 mt-1.5">Sin configurar para este entorno.</p>
            }
          </div>

          <!-- Webhook URL -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              URL del Webhook
              <span class="ml-1 font-normal normal-case text-slate-400">(solo lectura)</span>
            </label>
            <div class="flex gap-2">
              <input type="text" readonly [value]="webhookUrl"
                class="flex-1 px-3.5 py-2.5 border border-slate-200 bg-slate-50 rounded-xl text-sm font-mono text-slate-500 focus:outline-none truncate" />
              <button (click)="copyWebhookUrl()"
                class="px-3 border border-slate-200 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                title="Copiar URL">
                <i class="pi pi-copy text-sm"></i>
              </button>
            </div>
            <p class="text-xs text-slate-400 mt-1.5">
              Pégala en Mercado Pago → Tu negocio → Webhooks, junto con el secret de abajo.
            </p>
          </div>

          <!-- Webhook Secret -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Webhook Secret
              <span class="ml-1 font-normal normal-case text-slate-400">(opcional)</span>
            </label>
            <div class="flex gap-2">
              <input
                [type]="showWebhookSecret() ? 'text' : 'password'"
                placeholder="Pegar o generar un secret..."
                [value]="mpWebhookSecret()"
                (input)="mpWebhookSecret.set($any($event.target).value)"
                class="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rojo-brillante/30 focus:border-rojo-brillante transition-all" />
              <button (click)="showWebhookSecret.set(!showWebhookSecret())"
                class="px-3 border border-slate-200 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                [title]="showWebhookSecret() ? 'Ocultar' : 'Mostrar'">
                <i [class]="'pi text-sm ' + (showWebhookSecret() ? 'pi-eye-slash' : 'pi-eye')"></i>
              </button>
              <button (click)="generateAndSetSecret()"
                class="px-3 border border-slate-200 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 transition-colors"
                title="Generar secret aleatorio">
                <i class="pi pi-refresh text-sm"></i>
              </button>
            </div>
            @if (activeSecretMasked()) {
              <p class="text-xs text-slate-400 mt-1.5">
                Configurado: <span class="font-mono tracking-wider">{{ activeSecretMasked() }}</span>
              </p>
            } @else {
              <p class="text-xs text-slate-400 mt-1.5">Sin configurar. Los webhooks se aceptarán sin verificar firma.</p>
            }
          </div>

          <div class="pt-1">
            <button (click)="savePaymentCredentials()" [disabled]="paymentSaving()"
              class="flex items-center gap-2 bg-rojo-brillante text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-rojo-brillante/90 transition-colors shadow-sm disabled:opacity-60">
              @if (paymentSaving()) {
                <div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
              }
              Guardar credenciales
            </button>
          </div>
        </div>
      }

    </div>
  }
```

- [ ] **Step 7: Verificar compilación completa**

```bash
cd /home/eduardo/Proyectos/hula-hoop
ng build 2>&1 | tail -20
```

Resultado esperado: `Build at:` sin errores de compilación.

- [ ] **Step 8: Verificar en el navegador**

```bash
cd /home/eduardo/Proyectos/hula-hoop
npm run serve 2>/dev/null || ng serve --open
```

Navegar a Configuración → pestaña "Pagos". Verificar:
- El toggle muestra Sandbox activo con banner naranja
- El campo Access Token está vacío (aún no hay credenciales)
- La Webhook URL muestra `https://jzdfxbbnhkzdetrpmqdx.supabase.co/functions/v1/mp-webhook`
- El botón copiar de la URL funciona (verificar con `Ctrl+V` en cualquier campo)
- El botón "Generar" del secret genera un UUID y lo pone visible en el campo
- Cambiar a Producción → guarda inmediatamente → banner cambia a verde
- Pegar un token de prueba → guardar → la pantalla recarga y muestra la máscara `••••••••Token`

- [ ] **Step 9: Commit**

```bash
git add src/app/features/admin/pages/admin-config/admin-config.ts \
        src/app/features/admin/pages/admin-config/admin-config.html
git commit -m "feat(config): add Pagos tab with MP credentials management"
```

---

## Task 4: Actualizar Edge Functions para leer credenciales desde DB

**Files:**
- Modify: `supabase/functions/create-payment/index.ts`
- Modify: `supabase/functions/mp-webhook/index.ts`

**Interfaces:**
- Consumes: tabla `payment_settings` (Task 1) — columnas `mp_mode`, `mp_sandbox_access_token`, `mp_prod_access_token`, `mp_sandbox_webhook_secret`, `mp_prod_webhook_secret`
- Fallback a `Deno.env.get('MP_ACCESS_TOKEN')` y `Deno.env.get('MP_WEBHOOK_SECRET')` si DB no tiene valor

---

- [ ] **Step 1: Crear función helper de lectura de credenciales**

Esta lógica se añade al inicio de cada función, después de crear `supabaseAdmin`. El patrón es idéntico en ambas edge functions, por eso se documenta aquí una vez.

```typescript
// Leer credenciales desde DB (con fallback a env vars)
const { data: ps } = await supabaseAdmin
  .from('payment_settings')
  .select('mp_mode, mp_sandbox_access_token, mp_prod_access_token, mp_sandbox_webhook_secret, mp_prod_webhook_secret')
  .limit(1)
  .maybeSingle()

const isProduction = ps?.mp_mode === 'production'

const mpAccessToken: string | undefined =
  (isProduction ? ps?.mp_prod_access_token : ps?.mp_sandbox_access_token)
  ?? Deno.env.get('MP_ACCESS_TOKEN')

const mpWebhookSecret: string | undefined =
  (isProduction ? ps?.mp_prod_webhook_secret : ps?.mp_sandbox_webhook_secret)
  ?? Deno.env.get('MP_WEBHOOK_SECRET')
```

- [ ] **Step 2: Modificar `create-payment/index.ts`**

Localizar en `supabase/functions/create-payment/index.ts` el bloque donde se crea `supabaseAdmin` y se leen las env vars (líneas 26-31 aproximadamente):

```typescript
// ANTES:
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:4200'
    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')

    if (!mpAccessToken) {
      return new Response(
        JSON.stringify({ error: 'MP_ACCESS_TOKEN no configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

// DESPUÉS:
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:4200'

    // Leer credenciales desde DB (con fallback a env vars para compatibilidad)
    const { data: ps } = await supabaseAdmin
      .from('payment_settings')
      .select('mp_mode, mp_sandbox_access_token, mp_prod_access_token')
      .limit(1)
      .maybeSingle()

    const isProduction = ps?.mp_mode === 'production'
    const mpAccessToken: string | undefined =
      (isProduction ? ps?.mp_prod_access_token : ps?.mp_sandbox_access_token)
      ?? Deno.env.get('MP_ACCESS_TOKEN')

    if (!mpAccessToken) {
      return new Response(
        JSON.stringify({ error: 'MP_ACCESS_TOKEN no configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
```

- [ ] **Step 3: Modificar `mp-webhook/index.ts`**

Localizar en `supabase/functions/mp-webhook/index.ts` las dos líneas que leen de `Deno.env` (líneas 27 y 77 aproximadamente):

```typescript
// ANTES (línea ~27, lectura del secret al inicio):
    const mpWebhookSecret = Deno.env.get('MP_WEBHOOK_SECRET')

// DESPUÉS — reemplazar esas dos líneas sueltas con un bloque unificado
// al inicio del handler, justo después del bloque try {
// (antes de la lectura de query params):
```

Agregar justo después de `try {` y antes de `const url = new URL(req.url)`:

```typescript
    // Leer credenciales desde DB (con fallback a env vars para compatibilidad)
    const supabaseForCreds = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: ps } = await supabaseForCreds
      .from('payment_settings')
      .select('mp_mode, mp_sandbox_access_token, mp_prod_access_token, mp_sandbox_webhook_secret, mp_prod_webhook_secret')
      .limit(1)
      .maybeSingle()

    const isProduction = ps?.mp_mode === 'production'
    const mpWebhookSecret: string | undefined =
      (isProduction ? ps?.mp_prod_webhook_secret : ps?.mp_sandbox_webhook_secret)
      ?? Deno.env.get('MP_WEBHOOK_SECRET')
    const mpAccessToken: string | undefined =
      (isProduction ? ps?.mp_prod_access_token : ps?.mp_sandbox_access_token)
      ?? Deno.env.get('MP_ACCESS_TOKEN')
```

Luego eliminar las dos líneas sueltas que ya no aplican:
- La línea `const mpWebhookSecret = Deno.env.get('MP_WEBHOOK_SECRET')` (línea ~27)
- La línea `const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')` (línea ~77) junto con su bloque `if (!mpAccessToken)` — ese bloque se puede mantener igual, solo que ahora `mpAccessToken` ya viene del bloque unificado

- [ ] **Step 4: Verificar las edge functions con Supabase CLI**

```bash
cd /home/eduardo/Proyectos/hula-hoop
supabase functions serve create-payment --no-verify-jwt 2>&1 | head -10
```

Resultado esperado: la función inicia sin errores de sintaxis TypeScript/Deno. Ctrl+C para detener.

- [ ] **Step 5: Desplegar edge functions a producción**

```bash
cd /home/eduardo/Proyectos/hula-hoop
supabase functions deploy create-payment
supabase functions deploy mp-webhook
```

Resultado esperado: ambas funciones muestran `Deployed` sin errores.

- [ ] **Step 6: Smoke test end-to-end**

1. Abrir la app en el navegador, ir a Configuración → Pagos
2. Cambiar a Producción
3. Pegar el `MP_ACCESS_TOKEN` de producción real → Guardar
4. Verificar que aparece la máscara `••••••••••••TeSj` bajo el campo
5. Intentar un pago de prueba desde el flujo de cotización (`/cotizacion/:token`)
6. Verificar en los logs de Supabase Edge Functions que `create-payment` se ejecuta sin el error `MP_ACCESS_TOKEN no configurado`

- [ ] **Step 7: Commit final**

```bash
git add supabase/functions/create-payment/index.ts \
        supabase/functions/mp-webhook/index.ts
git commit -m "feat: edge functions read MP credentials from payment_settings DB"
```

---

## Checklist de Self-Review

- [x] **Spec coverage:** Tabla `payment_settings` ✓ | RLS con `user_is_manager_of` ✓ | Toggle Sandbox/Producción ✓ | Access Token enmascarado ✓ | Webhook URL read-only + copiar ✓ | Webhook Secret + generar ✓ | Edge functions con fallback ✓ | Sin Public Key (fuera de scope) ✓
- [x] **Placeholders:** Ninguno — todo el código está completo
- [x] **Type consistency:** `MaskedPaymentSettings` producido en Task 1, consumido en Task 2 y Task 3 con nombres exactos. `PaymentSettingsUpdate` idem. `MpMode` idem.
- [x] **Método `saveMode` vs `saveCredentials`:** separados intencionalmente — el toggle guarda solo `mp_mode` al instante; el botón "Guardar" guarda tokens
- [x] **`supabaseForCreds` en mp-webhook:** nombre distinto para evitar redeclaración; los `createClient` posteriores en la misma función siguen siendo `supabaseAdmin`/`supabaseAdminQ` como antes
