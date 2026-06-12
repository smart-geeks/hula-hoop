# Plan de Trabajo: Landing Page Multi-Salón
## Proyecto: Hula-Hoop (Angular 21 + Supabase)

Plan técnico definitivo para expandir las capacidades multi-venue al sitio público. Incorpora correcciones de bugs SQL, optimización RLS, compatibilidad SEO y arquitectura de servicios validada contra el código actual.

---

## 🎯 1. Objetivos del Sistema

1. **Dinamismo por Sucursal:** Cargar dinámicamente paquetes, Play Day, menú, contacto y galería según la sucursal activa en la URL.
2. **SEO & SSR Resiliente:** Ruteo `/:venue_slug` + persistencia vía Cookies (no localStorage) para pre-renderizado SSR correcto sin hydration mismatch.
3. **Seguridad RBAC intacta:** Acceso anónimo a la landing sin tocar las políticas del panel admin.
4. **Resiliencia & Fallbacks:** Si una sucursal no tiene sección CMS configurada, carga los textos/imágenes actuales de producción por defecto.

---

## 🛠️ 2. Fase 1: Base de Datos & Políticas RLS

### 2.1 Migración de Esquema

Archivo: `supabase/migrations/20260525000001_landing_multi_venue.sql`

Las tablas `packages`, `restaurant_items` y `gallery_images` **no tienen `venue_id`** todavía — la migración anterior (`20260523000004`) cubrió las 12 tablas del panel admin pero no las de la landing pública.

```sql
-- ── 1. Agregar venue_id a las 3 tablas de la landing ─────────────────────────
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
ALTER TABLE restaurant_items
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;
ALTER TABLE gallery_images
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE RESTRICT;

-- ── 2. Backfill: asignar al Salón Principal (UUID fijo del seed existente) ────
UPDATE packages       SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
UPDATE restaurant_items SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;
UPDATE gallery_images SET venue_id = '00000000-0000-0000-0000-000000000001' WHERE venue_id IS NULL;

-- ── 3. Aplicar NOT NULL tras el backfill ─────────────────────────────────────
ALTER TABLE packages        ALTER COLUMN venue_id SET NOT NULL;
ALTER TABLE restaurant_items ALTER COLUMN venue_id SET NOT NULL;
ALTER TABLE gallery_images  ALTER COLUMN venue_id SET NOT NULL;

-- ── 4. Índices de rendimiento ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_packages_venue_id          ON packages(venue_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_items_venue_id  ON restaurant_items(venue_id);
CREATE INDEX IF NOT EXISTS idx_gallery_images_venue_id    ON gallery_images(venue_id);
```

### 2.2 Políticas RLS — Reglas de Diseño

**Principio:** No tocar ninguna política existente del admin. Solo agregar políticas nuevas de lectura pública.

**Por qué `TO anon, authenticated` y no solo `TO anon`:**
En cuanto un cliente final inicia sesión (para ver `/mi-cuenta/reservas` o pagar una reserva), el cliente Supabase JS almacena su JWT y lo envía automáticamente en todas las peticiones. PostgreSQL cambia el rol de sesión de `anon` a `authenticated`. Si las políticas del catálogo público son solo `TO anon`, ese cliente logueado verá la landing **completamente en blanco** — 0 paquetes, 0 precios, 0 galería.

Los catálogos de la landing (`packages`, `restaurant_items`, `gallery_images`, `venue_config`) son **datos públicos de lectura**. No hay riesgo de seguridad en exponerlos a `authenticated`. El RBAC del admin está protegido por políticas separadas sobre las tablas internas (`contracts`, `quotes`, `pos_sessions`, etc.) que no se tocan.

```sql
-- ── venues: lectura pública de venues activos ─────────────────────────────────
-- "venues_select" existente (authenticated → solo sus venues para el admin) NO se toca.
-- Esta política adicional permite que la landing liste sucursales sin restricción.
CREATE POLICY "venues_public_read" ON venues
  FOR SELECT TO anon, authenticated
  USING (activo = true);

-- ── venue_config: precios y aforo necesarios para la landing ──────────────────
-- Campos expuestos: playdate_ticket_price_cents, playdate_extra_adult_price_cents,
--                   max_capacity_per_slot, min_hours_before_private,
--                   private_booking_horizon_date
-- Todos son datos operativos públicos que el visitante necesita ver.
CREATE POLICY "venue_config_public_read" ON venue_config
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── packages: paquetes activos por venue ──────────────────────────────────────
CREATE POLICY "packages_public_read" ON packages
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- ── restaurant_items: menú activo por venue ───────────────────────────────────
CREATE POLICY "restaurant_items_public_read" ON restaurant_items
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- ── gallery_images: imágenes activas por venue ────────────────────────────────
CREATE POLICY "gallery_images_public_read" ON gallery_images
  FOR SELECT TO anon, authenticated
  USING (is_active = true);
```

> **¿No rompe el RBAC del admin?** No. Un admin autenticado que accede a la landing verá todos los venues activos (correcto — es la lista pública). Su acceso privilegiado a tablas internas (`contracts`, `pos_sessions`, etc.) sigue controlado por las políticas existentes `*_venue` que usan `user_venue_ids()`. Las tablas del catálogo público no contienen datos sensibles del negocio.

### 2.3 CMS de Secciones (`venue_landing_sections`)

Tabla JSONB para que cada sucursal pueda personalizar textos e imágenes sin alterar el código Angular:

```sql
CREATE TABLE IF NOT EXISTS venue_landing_sections (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     UUID        NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  section_key  TEXT        NOT NULL,
  -- Valores: 'hero' | 'polaroid' | 'private_events' | 'play_day' | 'footer'
  title        TEXT,
  subtitle     TEXT,
  content_json JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (venue_id, section_key)
);

ALTER TABLE venue_landing_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "landing_sections_public_read" ON venue_landing_sections
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_landing_sections_venue_section
  ON venue_landing_sections(venue_id, section_key);
```

**Estructura JSONB por sección (ejemplos):**

`section_key = 'hero'`:
```json
{
  "background_image_url": "https://.../kids-playing.webp",
  "button_text": "Reservar Fiesta"
}
```

`section_key = 'polaroid'`:
```json
{
  "cards": [
    { "rotation": -6, "caption": "Alberca de Pelotas Gigante" },
    { "rotation": 3,  "caption": "Pared de Escalar Segura" }
  ]
}
```

> **Nota sobre UI Admin:** Este CMS requiere una pantalla de administración para gestionar el JSONB por sucursal. Queda fuera del alcance de este plan (fase futura).

---

## 🔀 3. Fase 2: Ruteo de Angular

### 3.1 `app.routes.ts` — Jerarquía Blindada

Regla: todas las rutas de segmento fijo deben declararse **antes** del catch-all `/:venue_slug` para que el router no las interprete como slugs.

**Problema SEO:** La ruta `/conocenos` existe actualmente como ruta de primer nivel y puede estar indexada por Google o enlazada en redes sociales. Al moverla a `/:venue_slug/conocenos`, se convierte en URL rota. Se agrega redirect de compatibilidad apuntando al salón principal.

```typescript
// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { rootRedirectGuard } from './core/guards/root-redirect.guard';
import { venueExistsGuard } from './core/guards/venue-exists.guard';

export const routes: Routes = [
  // ── 1. Admin y autenticación ──────────────────────────────────────────────
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadChildren: () =>
      import('./features/admin/admin.routes').then(m => m.adminRoutes),
  },
  {
    path: 'auth/update-password',
    loadComponent: () =>
      import('./features/auth/pages/update-password/update-password-page')
        .then(m => m.UpdatePasswordPage),
  },

  // ── 2. Rutas públicas fijas (deben ir ANTES de :venue_slug) ──────────────
  {
    path: 'mi-cuenta/reservas',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/account/pages/my-reservations-page/my-reservations-page')
        .then(m => m.MyReservationsPage),
  },
  {
    path: 'cotizacion/:token',
    loadComponent: () =>
      import('./features/quotes/pages/quote-public-page/quote-public-page')
        .then(m => m.QuotePublicPage),
  },
  {
    path: 'reserva/:accessToken',
    loadComponent: () =>
      import('./features/reservations/pages/reservation-detail-page/reservation-detail-page')
        .then(m => m.ReservationDetailPage),
  },
  {
    path: 'aviso-de-privacidad',
    loadComponent: () =>
      import('./features/legal/privacy-page').then(m => m.PrivacyPage),
  },
  {
    path: 'terminos-y-condiciones',
    loadComponent: () =>
      import('./features/legal/terms-page').then(m => m.TermsPage),
  },

  // ── 3. Redirect de compatibilidad SEO (/conocenos legacy) ────────────────
  // La ruta /conocenos existía como ruta de primer nivel. Puede estar indexada
  // en Google o enlazada en redes. Redirige al salón principal para no romper.
  {
    path: 'conocenos',
    redirectTo: '/salon-principal/conocenos',
    pathMatch: 'full',
  },

  // ── 4. Raíz: selector de sucursal o redirect via cookie ──────────────────
  {
    path: '',
    canActivate: [rootRedirectGuard],
    loadComponent: () =>
      import('./features/home/pages/venue-selector/venue-selector')
        .then(m => m.VenueSelectorPage),
  },

  // ── 5. CATCH-ALL: landing dinámica por sucursal ──────────────────────────
  {
    path: ':venue_slug',
    canActivate: [venueExistsGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/home/pages/home-page/home-page')
            .then(m => m.HomePage),
      },
      {
        path: 'conocenos',
        loadComponent: () =>
          import('./features/gallery/pages/gallery-page/gallery-page')
            .then(m => m.GalleryPage),
      },
      {
        path: 'reservar/fiesta-privada',
        loadComponent: () =>
          import('./features/reservations/pages/private-reservation-page/private-reservation-page')
            .then(m => m.PrivateReservationPage),
      },
      {
        path: 'reservar/play-day',
        loadComponent: () =>
          import('./features/reservations/pages/playdate-reservation-page/playdate-reservation-page')
            .then(m => m.PlaydateReservationPage),
      },
    ],
  },
];
```

### 3.2 `rootRedirectGuard`

Lee la cookie `hh_preferred_venue`. Si existe un slug válido, redirige directamente sin mostrar el selector. Usa `inject(REQUEST)` del paquete SSR para leer cookies en el servidor.

```typescript
// src/app/core/guards/root-redirect.guard.ts
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';

const COOKIE_KEY = 'hh_preferred_venue';

export const rootRedirectGuard: CanActivateFn = () => {
  const router     = inject(Router);
  const platformId = inject(PLATFORM_ID);

  const slug = isPlatformBrowser(platformId)
    ? readCookieBrowser(COOKIE_KEY)
    : null; // En SSR: sin cookie → mostrar selector

  if (slug) {
    return router.createUrlTree(['/', slug]);
  }
  return true; // Mostrar VenueSelectorPage
};

function readCookieBrowser(key: string): string | null {
  try {
    const match = document.cookie
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith(`${key}=`));
    return match ? decodeURIComponent(match.split('=')[1]) : null;
  } catch {
    return null;
  }
}
```

### 3.3 `venueExistsGuard`

Valida que el slug en la URL existe en Supabase. Si no existe, redirige a `'/'`.

```typescript
// src/app/core/guards/venue-exists.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { PublicVenueService } from '../services/public-venue.service';

export const venueExistsGuard: CanActivateFn = async (route: ActivatedRouteSnapshot) => {
  const router       = inject(Router);
  const publicVenue  = inject(PublicVenueService);

  const slug  = route.paramMap.get('venue_slug') ?? '';
  const venue = await publicVenue.findBySlug(slug);

  if (!venue) {
    return router.createUrlTree(['/']);
  }

  publicVenue.setActiveVenue(venue);
  return true;
};
```

---

## 🔄 4. Fase 3: `PublicVenueService`

Servicio completamente independiente del `VenueService` del admin. No requiere autenticación. Maneja el estado de la sucursal activa para toda la landing.

```typescript
// src/app/core/services/public-venue.service.ts
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseService } from './supabase.service';
import type { Venue } from '../interfaces/venue';

const COOKIE_KEY   = 'hh_preferred_venue';
const COOKIE_DAYS  = 30;

@Injectable({ providedIn: 'root' })
export class PublicVenueService {
  private readonly supabase    = inject(SupabaseService);
  private readonly platformId  = inject(PLATFORM_ID);

  readonly venues         = signal<Venue[]>([]);
  readonly activeVenue    = signal<Venue | null>(null);

  // Carga la lista pública de sucursales activas (sin auth, usa anon key)
  async loadPublicVenues(): Promise<void> {
    const client = this.supabase.client;
    if (!client) return;

    const { data, error } = await client
      .from('venues')
      .select('id, nombre, slug, direccion, telefono, email, logo_url')
      .eq('activo', true)
      .order('nombre');

    if (error) { console.error('Error loading public venues:', error.message); return; }
    this.venues.set((data ?? []) as Venue[]);
  }

  // Busca una sucursal por slug (usado en venueExistsGuard)
  async findBySlug(slug: string): Promise<Venue | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('venues')
      .select('id, nombre, slug, direccion, telefono, email, logo_url')
      .eq('slug', slug)
      .eq('activo', true)
      .single();

    if (error) return null;
    return data as Venue;
  }

  // Establece la sucursal activa y persiste en cookie
  setActiveVenue(venue: Venue): void {
    this.activeVenue.set(venue);
    this.writeCookie(COOKIE_KEY, venue.slug, COOKIE_DAYS);
  }

  private writeCookie(key: string, value: string, days: number): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const expires = new Date(Date.now() + days * 864e5).toUTCString();
      document.cookie = `${key}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
    } catch {}
  }
}
```

---

## 📦 5. Fase 4: Servicios de Catálogo — Sin Romper el Admin

**Regla:** No cambiar las firmas existentes de `PackageService`, `GalleryService` ni `RestaurantItemService`. Los componentes del admin usan esos métodos sin `venueId` y seguirán funcionando.

Se agregan **métodos nuevos** con sufijo `ByVenue` para uso exclusivo de la landing pública:

### `PackageService`
```typescript
// Agregar en src/app/core/services/package.service.ts
async getActivePackagesByVenue(venueId: string): Promise<PartyPackage[]> {
  const client = this.supabase.client;
  if (!client) return [];

  const { data, error } = await client
    .from('packages')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('sort_order')
    .order('name');

  if (error) { console.error('Error fetching packages by venue:', error.message); return []; }
  return data as PartyPackage[];
}
```

### `RestaurantItemService`
```typescript
// Agregar en src/app/core/services/restaurant-item.service.ts
async getActiveItemsByVenue(venueId: string): Promise<RestaurantItem[]> {
  const client = this.supabase.client;
  if (!client) return [];

  const { data, error } = await client
    .from('restaurant_items')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('category')
    .order('name');

  if (error) { console.error('Error fetching menu by venue:', error.message); return []; }
  return data as RestaurantItem[];
}
```

### `GalleryService`
```typescript
// Agregar en src/app/core/services/gallery.service.ts
async getActiveImagesByVenue(venueId: string): Promise<GalleryImage[]> {
  const client = this.supabase.client;
  if (!client) return [];

  const { data, error } = await client
    .from('gallery_images')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) { console.error('Error fetching gallery by venue:', error.message); return []; }
  return data ?? [];
}
```

### Actualizar interfaces TypeScript
```typescript
// packages.ts — agregar campo
export interface PartyPackage {
  // ...campos existentes...
  venue_id: string; // nuevo
}

// restaurant-item.ts — agregar campo
export interface RestaurantItem {
  // ...campos existentes...
  venue_id: string; // nuevo
}

// gallery-image.ts — agregar campo
export interface GalleryImage {
  // ...campos existentes...
  venue_id: string; // nuevo
}
```

---

## ⚙️ 6. Fase 5: Refactorización de Componentes de Landing

### 6.1 `ngOnInit` → `constructor` (CLAUDE.md — regla crítica)

El proyecto corre en modo **Zoneless** (`provideZonelessChangeDetection()`). Usar `ngOnInit` con cargas asíncronas en componentes de landing falla silenciosamente porque Angular no programa un ciclo de CD tras el callback. Todos los componentes afectados deben migrar al patrón de constructor.

**Componentes que requieren migración:**
- `PrivateEventsSection` (usa `ngOnInit` + `PackageService`)
- `PlayDaySection` (usa `ngOnInit` + `RestaurantItemService` + `VenueConfigService`)

**Patrón correcto para todos los componentes de la landing:**
```typescript
// ❌ Actual (viola CLAUDE.md — falla en Zoneless)
export class PrivateEventsSection implements OnInit {
  ngOnInit(): void { this.loadPackages(); }
}

// ✅ Correcto
export class PrivateEventsSection {
  private readonly packageService  = inject(PackageService);
  private readonly publicVenue     = inject(PublicVenueService);

  readonly packages = signal<PartyPackage[]>([]);

  constructor() {
    this.loadPackages();
  }

  private async loadPackages(): Promise<void> {
    const venue = this.publicVenue.activeVenue();
    if (!venue) return;
    const data = await this.packageService.getActivePackagesByVenue(venue.id);
    this.packages.set(data);
  }
}
```

### 6.2 `PlayDaySection` — Dependencia de `VenueConfigService`

**Problema actual:** `VenueConfigService.getConfig()` obtiene el `venueId` del admin `VenueService`, que solo carga cuando hay usuario autenticado. Para visitantes anónimos de la landing, `currentVenueId()` es `null` y los precios de Play Day no se cargan.

**Solución:** `PlayDaySection` debe usar `PublicVenueService` para el `venueId` y llamar a Supabase directamente (sin pasar por `VenueConfigService`):

```typescript
// En PlayDaySection — reemplazar uso de VenueConfigService por consulta directa
private async loadConfig(venueId: string): Promise<VenueConfig | null> {
  const { data } = await this.supabase.client
    .from('venue_config')
    .select('*')
    .eq('venue_id', venueId)
    .single();
  return data as VenueConfig ?? null;
}
```

### 6.3 Topbar — Actualizar Navegación a Raíz

El `Topbar` navega a `['/']` en dos lugares: `onLogout()` y `scrollToSection()`. Con el nuevo ruteo, `'/'` muestra el `VenueSelectorPage` (o redirige por cookie). El comportamiento correcto es navegar al slug activo.

```typescript
// src/app/shared/components/topbar/topbar.ts
private readonly publicVenue = inject(PublicVenueService);

async onLogout(): Promise<void> {
  await this.auth.logout();
  const slug = this.publicVenue.activeVenue()?.slug;
  this.router.navigate(slug ? ['/', slug] : ['/']);
}

async scrollToSection(id: string): Promise<void> {
  const slug    = this.publicVenue.activeVenue()?.slug;
  const homeUrl = slug ? `/${slug}` : '/';

  if (this.router.url !== homeUrl) {
    await this.router.navigate(slug ? ['/', slug] : ['/']);
  }
  setTimeout(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 350);
}
```

### 6.4 Fallbacks Estáticos en Componentes

Cada componente de la landing define datos estáticos como valor inicial. Si el CMS de Supabase no tiene registros para esa sucursal, la UI carga de inmediato con el contenido actual de producción:

```typescript
// Ejemplo en PrivateEventsSection
readonly inclusions = signal([
  'Merienda', 'Bebida Refill', 'Host',
  'Actividades', 'Vajilla', 'Asistentes Playground',
  'Piñata', 'Evento de 3 Horas',
]);

// computed con fallback: si no hay datos del CMS, usa los estáticos
readonly sectionContent = computed(() => {
  const cms = this.cmsSection();
  return cms ?? { title: 'Party with us!', subtitle: 'Celebra con nosotros...' };
});
```

---

## 🆕 7. Fase 6: `VenueSelectorPage`

Página que aparece cuando el usuario llega a `hulahoop.com/` sin cookie de preferencia. Carga las sucursales activas y permite elegir una. Al elegir, guarda la cookie y navega al slug correspondiente.

```typescript
// src/app/features/home/pages/venue-selector/venue-selector.ts
@Component({
  selector: 'app-venue-selector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './venue-selector.html',
})
export class VenueSelectorPage {
  private readonly router      = inject(Router);
  private readonly publicVenue = inject(PublicVenueService);

  readonly venues  = this.publicVenue.venues;
  readonly loading = signal(true);

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    await this.publicVenue.loadPublicVenues();
    // Si solo hay una sucursal, redirigir directamente sin mostrar selector
    const list = this.publicVenue.venues();
    if (list.length === 1) {
      this.publicVenue.setActiveVenue(list[0]);
      this.router.navigate(['/', list[0].slug]);
      return;
    }
    this.loading.set(false);
  }

  selectVenue(venue: Venue): void {
    this.publicVenue.setActiveVenue(venue);
    this.router.navigate(['/', venue.slug]);
  }
}
```

> **UX importante:** Si solo hay una sucursal activa, el selector no se muestra — redirige automáticamente. Esto mantiene la UX actual sin fricción adicional para el caso de salón único.

---

## 🛡️ 8. Plan de Control de Calidad

### Prueba 1 — RLS: acceso anónimo vs. datos internos
```bash
# Debe devolver lista de venues activos (público OK)
curl "https://<project>.supabase.co/rest/v1/venues?select=id,nombre,slug&activo=eq.true" \
  -H "apikey: <anon-key>"

# Debe devolver 0 registros o error (RBAC protegido)
curl "https://<project>.supabase.co/rest/v1/venue_users?select=*" \
  -H "apikey: <anon-key>"
```

### Prueba 2 — Redirección SSR con cookie
```bash
# Sin cookie: debe devolver 200 con VenueSelectorPage
curl -I "https://hulahoop.mx/"

# Con cookie: debe devolver 302 → /monterrey
curl -I "https://hulahoop.mx/" \
  --cookie "hh_preferred_venue=monterrey"
```

### Prueba 3 — SEO: redirect de /conocenos legacy
```bash
# Debe devolver 301/302 → /salon-principal/conocenos
curl -I "https://hulahoop.mx/conocenos"
```

### Prueba 4 — venueExistsGuard: slug inválido
```bash
# Un slug inventado debe redirigir a '/' (sin 500)
# Navegar a: https://hulahoop.mx/slug-inexistente
# Expected: redirect a hulahoop.mx/
```

### Prueba 5 — Metatags SSR por venue
```bash
# El <title> debe contener el nombre de la sucursal
curl -s "https://hulahoop.mx/monterrey" | grep "<title>"
# Expected: <title>Hula Hoop — Monterrey | ...</title>
```

---

## 📋 Resumen de Archivos a Crear/Modificar

| Acción | Archivo |
|--------|---------|
| CREAR | `supabase/migrations/20260525000001_landing_multi_venue.sql` |
| CREAR | `src/app/core/services/public-venue.service.ts` |
| CREAR | `src/app/core/guards/root-redirect.guard.ts` |
| CREAR | `src/app/core/guards/venue-exists.guard.ts` |
| CREAR | `src/app/features/home/pages/venue-selector/venue-selector.ts` |
| CREAR | `src/app/features/home/pages/venue-selector/venue-selector.html` |
| MODIFICAR | `src/app/app.routes.ts` |
| MODIFICAR | `src/app/core/services/package.service.ts` (nuevo método `getActivePackagesByVenue`) |
| MODIFICAR | `src/app/core/services/restaurant-item.service.ts` (nuevo método `getActiveItemsByVenue`) |
| MODIFICAR | `src/app/core/services/gallery.service.ts` (nuevo método `getActiveImagesByVenue`) |
| MODIFICAR | `src/app/core/interfaces/package.ts` (agregar `venue_id`) |
| MODIFICAR | `src/app/core/interfaces/restaurant-item.ts` (agregar `venue_id`) |
| MODIFICAR | `src/app/core/interfaces/gallery-image.ts` (agregar `venue_id`) |
| MODIFICAR | `src/app/features/home/components/private-events-section/private-events-section.ts` |
| MODIFICAR | `src/app/features/home/components/play-day-section/play-day-section.ts` |
| MODIFICAR | `src/app/shared/components/topbar/topbar.ts` |
