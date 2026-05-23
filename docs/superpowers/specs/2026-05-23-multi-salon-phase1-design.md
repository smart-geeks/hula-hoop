# Multi-Salón Phase 1 — Design Spec
**Fecha:** 2026-05-23  
**Autor:** Eduardo Baltazar + Claude  
**Estado:** Aprobado para implementación

---

## Contexto y objetivo

El sistema hula-hoop es actualmente **single-tenant**: todos los datos son visibles para cualquier usuario autenticado, sin distinción de salón o sucursal. El objetivo de Phase 1 es agregar soporte **multi-salón** al backoffice sin romper ninguna lógica de negocio existente.

**Phase 2** (fuera de este spec) cubrirá landing pages públicas por salón con su propio URL (`/s/:slug`).

---

## Principios de diseño

1. **No romper lógica de negocio** — solo se agrega la dimensión `venue_id`; ningún cálculo, trigger, ni RPC cambia su comportamiento.
2. **RLS como primera línea de defensa** — el frontend filtra por venue, pero la base de datos garantiza la frontera entre salones.
3. **Migración segura** — todas las columnas nuevas se agregan como nullable, se rellenan con el salón por defecto, y luego se hacen NOT NULL.
4. **Señal reactiva en Angular** — `VenueService.currentVenueId` es la única fuente de verdad en el frontend; todos los servicios la consumen.
5. **Clientes y categorías son globales** — se comparten entre salones (CRM unificado).

---

## Sección 1: Base de Datos

### 1.1 Nuevas tablas

```sql
-- Salón / sucursal
venues (
  id          UUID PK DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,   -- para URLs públicas en Phase 2
  direccion   TEXT,
  telefono    TEXT,
  email       TEXT,
  logo_url    TEXT,
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
)

-- RBAC por salón: qué rol tiene cada usuario en cada salón
venue_users (
  venue_id    UUID FK → venues(id) ON DELETE CASCADE,
  user_id     UUID FK → auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'staff'
                CHECK (role IN ('owner','admin','staff','readonly')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (venue_id, user_id)
)
```

### 1.2 Función RLS — `user_venue_ids()`

Evita subqueries correlacionadas por fila (O(n)). La función es `SECURITY DEFINER` y `STABLE`, lo que permite que el planner la cachée por transacción.

```sql
CREATE OR REPLACE FUNCTION user_venue_ids()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT venue_id FROM venue_users WHERE user_id = auth.uid();
$$;
```

Todas las políticas RLS usan: `USING (venue_id = ANY(user_venue_ids()))`

### 1.3 Tablas que reciben `venue_id`

| Tabla | Tipo de tabla | Acción |
|-------|--------------|--------|
| `venue_config` | Nuestra migración | ADD COLUMN venue_id FK → venues NOT NULL |
| `contracts` | Nuestra migración | ADD COLUMN venue_id FK → venues NOT NULL |
| `quotes` | Nuestra migración | ADD COLUMN venue_id FK → venues NOT NULL |
| `pos_sessions` | Nuestra migración | ADD COLUMN venue_id FK → venues NOT NULL |
| `inventory_items` | Nuestra migración | ADD COLUMN venue_id FK → venues NOT NULL |
| `admin_expenses` | Nuestra migración | ADD COLUMN venue_id FK → venues NOT NULL |
| `suppliers` | Nuestra migración | ADD COLUMN venue_id FK → venues NOT NULL |
| `purchases` | Nuestra migración | ADD COLUMN venue_id FK → venues NOT NULL |
| `cashier_profiles` | Nuestra migración | ADD COLUMN venue_id FK → venues NOT NULL |
| `private_reservations` | **Producción pre-existente** | ADD COLUMN venue_id FK → venues NOT NULL |
| `playdate_reservations` | **Producción pre-existente** | ADD COLUMN venue_id FK → venues NOT NULL |
| `time_slots` | **Producción pre-existente** | ADD COLUMN venue_id FK → venues NOT NULL |

**Tablas globales (sin venue_id):** `clients`, `categories`, `quote_items`, `contract_payments`, `purchase_items`, `inventory_movements`, `pos_sales`, `pos_sale_items`, `event_tasks`, `profiles`

### 1.4 Fix de constraint roto

`inventory_items.sku` actualmente es `UNIQUE` global. Con multi-salón, dos salones distintos pueden tener el mismo SKU:

```sql
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_sku_key;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_venue_sku_unique
  UNIQUE (venue_id, sku);
```

### 1.5 Salón por defecto para datos existentes

Se inserta un salón con UUID fijo para poder referenciar desde la migración:

```sql
INSERT INTO venues (id, nombre, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Salón Principal', 'salon-principal')
ON CONFLICT DO NOTHING;
```

Todos los registros existentes se asignan a este venue. **Todos los usuarios existentes** (owners, admins, staff, readonly) se insertan en `venue_users` para el salón por defecto con su rol actual de `profiles.role`. Sin este paso, la nueva RLS les bloquearía el acceso a todos los datos.

### 1.6 RPCs actualizadas

`create_cashier` recibe un nuevo parámetro `p_venue_id UUID` para asignar el cajero al salón correcto desde creación. No es breaking change si se actualiza el servicio Angular al mismo tiempo.

### 1.7 Vistas actualizadas

`pos_sales_detail` y `event_profit_loss` se actualizan con `venue_id` en el SELECT para que los reportes sean filtrables por salón.

---

## Sección 2: Capa Angular

### 2.1 Interfaces nuevas

```typescript
// src/app/core/interfaces/venue.ts
export interface Venue {
  id: string;
  nombre: string;
  slug: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  logo_url?: string;
  activo: boolean;
  created_at: string;
}

export interface VenueUser {
  venue_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'staff' | 'readonly';
  created_at: string;
}
```

### 2.2 Interfaces actualizadas

Se agrega `venue_id: string` a:
- `Contract`, `CreateContractData`, `UpdateContractData`
- `Quote`
- `PosSession`
- `InventoryItem`
- `AdminExpense`
- `Supplier`
- `Purchase`
- `CashierProfile`
- `VenueConfig`

### 2.3 VenueService

```
src/app/core/services/venue.service.ts
```

```typescript
@Injectable({ providedIn: 'root' })
export class VenueService {
  // Señales públicas
  readonly venues     = signal<Venue[]>([]);
  readonly currentVenueId = signal<string | null>(/* from localStorage */);
  readonly currentVenue   = computed(() =>
    this.venues().find(v => v.id === this.currentVenueId()) ?? null
  );
  readonly loading = signal(true);

  // Se inicializa via effect() cuando auth.currentUser() cambia
  // Persiste selección en localStorage ('hh_venue_id')
  // Auto-selecciona el primer venue si el stored no es válido
}
```

**Contrato público:**
- `switchVenue(venueId: string): void` — cambia salón activo
- `createVenue(data): Promise<Venue | null>` — solo owners
- `updateVenue(id, data): Promise<Venue | null>` — solo owners
- `assignUser(venueId, userId, role): Promise<boolean>` — solo owners/admins
- `removeUser(venueId, userId): Promise<boolean>` — solo owners/admins
- `getVenueUsers(venueId): Promise<VenueUser[]>`

### 2.4 Servicios actualizados

Patrón uniforme para **todos** los servicios de las 8 tablas raíz:

```typescript
// Inyección
private readonly venue = inject(VenueService);

// getAll — agrega filtro
.eq('venue_id', this.venue.currentVenueId()!)

// create — agrega campo
.insert({ ...data, venue_id: this.venue.currentVenueId()! })
```

Servicios afectados: `ContractService`, `QuoteService`, `PosService`, `InventoryService`, `ExpenseService`, `SupplierService`, `PurchaseService`, `CashierService`, `VenueConfigService`.

**`generateFolio()` en ContractService y PurchaseService:** se agrega `.eq('venue_id', venueId)` al count para que los folios sean independientes por salón.

### 2.5 VenueSwitcherComponent

```
src/app/features/admin/components/venue-switcher/venue-switcher.ts
```

- Solo visible si `venues().length > 1`
- Muestra el nombre del salón activo con ícono de edificio
- Dropdown con lista de salones accesibles
- Al seleccionar: llama `venue.switchVenue(id)` y navega a la ruta actual (reload de datos via constructor pattern)
- Accesible: keyboard navigation, aria-label

### 2.6 AdminLayout — integración

Se inserta `<app-venue-switcher>` en la barra superior del admin-layout, junto al avatar/nombre del usuario.

### 2.7 Nueva página: AdminVenues

```
src/app/features/admin/pages/admin-venues/admin-venues.ts
```

Ruta: `admin/salones`  
Solo visible para `isOwner`.

Funcionalidades:
- Listar salones con estado activo/inactivo
- Crear nuevo salón (nombre, slug, datos de contacto)
- Editar salón existente
- Ver y gestionar usuarios asignados a cada salón (asignar role, remover)

Se agrega entrada en el `navSections` de `AdminLayout` bajo una nueva sección "Administración" visible solo para owners.

---

## Sección 3: Flujo de datos

```
Usuario hace login
  → AuthService.fetchProfile() carga UserProfile
  → VenueService.effect() detecta currentUser()
  → VenueService.loadVenues() consulta venues (filtrado por RLS/venue_users)
  → venues signal se llena; currentVenueId se resuelve (localStorage o primer venue)
  → AdminLayout renderiza VenueSwitcher si venues.length > 1
  → Cada servicio (ContractService, etc.) usa currentVenueId() en sus queries
```

---

## Sección 4: Orden de migración

La migración es **una sola transacción atómica** (`20260523000004_multi_venue_phase1.sql`):

1. Crear función `user_venue_ids()`
2. Crear tabla `venues` + insertar salón por defecto
3. Crear tabla `venue_users`
4. Poblar `venue_users` desde `profiles` para el venue por defecto
5. ADD COLUMN `venue_id` (nullable) en las 12 tablas
6. UPDATE masivo para asignar el venue por defecto a todos los registros existentes
7. ALTER COLUMN `venue_id` SET NOT NULL en las tablas de negocio
8. Drop + recrear constraints (SKU unique)
9. Drop políticas RLS existentes + crear nuevas con `user_venue_ids()`
10. Actualizar función `create_cashier` para aceptar `p_venue_id`
11. Actualizar vistas `pos_sales_detail` y `event_profit_loss`
12. Índices en `venue_id` para todas las tablas afectadas

---

## Sección 5: Lo que NO cambia

- Toda la lógica de contratos, pagos, cotizaciones
- Los triggers de stock (`trg_update_stock`)
- Las RPCs de cashier (`validate_cashier_pin`, `update_cashier_pin`)
- La vista `event_profit_loss` (solo se agrega `venue_id` al SELECT)
- La autenticación de usuarios (`AuthService`)
- El sistema de roles de perfiles (`UserProfile.role`)
- `clients` y `categories` — globales, sin venue_id

---

## Fuera de alcance (Phase 2)

- Landing page pública por salón (`/s/:slug`)
- Reservaciones públicas filtradas por salón
- SEO por salón
- Reportes cross-venue para owners
