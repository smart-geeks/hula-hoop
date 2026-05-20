# Roadmap: Hula-Hoop → Plataforma de Gestión de Eventos

> **Última actualización:** 2026-05-19
> **Estado actual del proyecto:** Sistema de reservaciones funcional (salón de fiestas)
> **Objetivo:** Convertir en plataforma completa de gestión operativa y financiera de eventos

---

## Contexto del Proyecto

### ¿Qué es hoy?
Un sistema de reservaciones online para un salón de fiestas ("Hula-Hoop"). Los clientes reservan en línea, pagan anticipo vía Mercado Pago, y el admin gestiona reservaciones desde un panel.

### ¿Qué debe ser?
Una plataforma interna de gestión tipo **EventControl** (ver `Presentacion_Eventcontrol_2026.pdf` en la raíz del proyecto), pero construida a medida: sin costo mensual recurrente, adaptada 100% al flujo del negocio, con estado de resultados por evento como pieza central.

### Referencia competitiva — EventControl
- SaaS mexicano para salones de eventos: $699–$1,999 MXN/mes
- Módulos: Dashboard, Cotizaciones, Contratos, Clientes, Proveedores, Gastos Admin, Paquetes, Elementos, Compras, Inventarios, Factura CFDI, Catálogos, Reportes, Roles, Usuarios, Configuración, Calendario, App Móvil
- El cliente vio su demo y quiere algo equivalente o mejor

### Requerimiento financiero clave (del cliente)
El dueño quiere ver por cada evento vendido:
```
INGRESOS
  Renta del salón
  + Extras/adicionales contratados
  + Ventas del día (POS)

COSTOS DIRECTOS
  - Compras específicas del evento
  - Consumo de inventario

GASTOS OPERATIVOS
  - Nómina staff asignado al evento
  - Proporción de gastos fijos (luz, renta local, etc.)

= UTILIDAD NETA DEL EVENTO
```

---

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Angular | 21.1.0 |
| UI Components | PrimeNG | 21.1.1 |
| Estilos | Tailwind CSS | 4.1.12 |
| Backend/DB | Supabase (PostgreSQL) | — |
| Auth | Supabase Auth | — |
| Pagos | Mercado Pago | test mode |
| PDF Export | jspdf + html2canvas | instalado |
| SSR | Angular + Express | 5.1.0 |
| Package manager | Bun | 1.1.40 |
| Testing | Vitest + Jasmine | — |
| Animaciones | GSAP, canvas-confetti | instalado |

**Supabase project:** `jzdfxbbnhkzdetrpmqdx.supabase.co`

---

## Estado Actual del Código

### Rutas públicas (`/`)
- `/` — Home page (hero, galería, secciones de marketing)
- `/conocenos` — Galería
- `/reservar/fiesta-privada` — Formulario reservación privada
- `/reservar/play-day` — Formulario play date
- `/reserva/:accessToken` — Detalle de reservación del cliente
- `/mi-cuenta/reservas` — Reservaciones del usuario (auth required)
- `/aviso-de-privacidad`, `/terminos-y-condiciones`

### Rutas del admin (`/admin`) — `adminGuard` requerido
| Ruta | Componente | Estado |
|------|-----------|--------|
| `/admin/reservas` | AdminReservations | Funcional |
| `/admin/paquetes` | AdminPackages | Funcional |
| `/admin/extras` | AdminExtras | Funcional |
| `/admin/meriendas` | AdminSnacks | Funcional |
| `/admin/horarios` | AdminTimeSlots | Funcional |
| `/admin/restaurante` | AdminRestaurant | Funcional |
| `/admin/galeria` | AdminGallery | Funcional |
| `/admin/configuracion` | AdminConfig | Funcional |

### Estructura de carpetas
```
src/app/
├── core/
│   ├── guards/        auth.guard, admin.guard
│   ├── interfaces/    extra, gallery-image, package, reservation,
│   │                  restaurant-item, snack-option, time-slot,
│   │                  user-profile, venue-config
│   ├── pipes/         currency-mxn.pipe
│   └── services/      auth, extra, gallery, json-ld, package, payment,
│                      reservation-print, reservation, restaurant-item,
│                      seo, snack-option, supabase, time-slot, venue-config
├── features/
│   ├── account/       my-reservations-page
│   ├── admin/         admin-layout + 8 páginas
│   ├── auth/          update-password-page
│   ├── gallery/       gallery-page
│   ├── home/          home-page + 7 secciones
│   ├── legal/         privacy-page, terms-page
│   └── reservations/  private, playdate, detail pages
├── shared/
│   └── components/    auth-dialog, topbar
└── theme/             hula-hoop-preset.ts (PrimeNG preset)
```

### Interfaces existentes clave
- `PrivateReservation` — reservación privada completa (precio en centavos)
- `PlaydateReservation` — reservación play date
- `ReservationStatus` — `pending_payment | confirmed | completed | cancelled | expired`
- `PartyPackage` — paquetes con colores, tipos de depósito
- `TimeSlot` — horarios con diferencial fin de semana
- `VenueConfig` — capacidad, precios, horizontes de reservación
- `Extra`, `SnackOption`, `RestaurantItem`, `GalleryImage`, `UserProfile`

### Tablas Supabase existentes (inferidas)
`private_reservations`, `playdate_reservations`, `packages`, `time_slots`, `extras`, `snack_options`, `restaurant_items`, `gallery_images`, `venue_config`, `user_profiles`

---

## Arquitectura Target

### Mapa de módulos y dependencias
```
NÚCLEO
├── Clientes ──────────────────────────┐
├── Catálogos (Paquetes, Extras) ──────┤
└── Calendario de Eventos ─────────────┤
                                       ↓
CICLO COMERCIAL                 CICLO OPERATIVO
├── Cotizaciones ←── Clientes   ├── Inventario
│   └── → Contratos             │   └── → Punto de Venta
│         └── → Evento activo   ├── Actividades Staff
│               └── → Pagos     └── Compras → Proveedores
                                        ↓
FINANCIERO (CENTRO DE REPORTES)
├── Gastos Admin
├── Estado de Resultados por Evento (P&L)
├── Dashboard financiero + operativo
└── Reportes exportables (PDF / Excel)
```

### Rutas target del admin
```
/admin
  /dashboard           KPIs financieros + operativos del día
  /calendario          Vista maestra de todos los eventos (mes/semana/día)
  /clientes            CRM básico: lista, detalle, historial
  /cotizaciones        Pipeline comercial con estados
  /contratos           Contratos activos/cerrados con PDFs
  /eventos             Hub operativo por evento
    /:id/detalle       Info del evento, pagos, contrato
    /:id/actividades   Tasks del staff para ese evento
    /:id/resultados    P&L del evento en tiempo real
  /inventario          Existencias + movimientos (entrada/salida)
  /punto-de-venta      POS táctil conectado a inventario
  /compras             Órdenes de compra por proveedor/evento
  /proveedores         Directorio de proveedores
  /gastos              Gastos administrativos por categoría
  /reportes            Reportes agregados con exportación
  /configuracion       Multi-usuario, roles, datos del salón
  --- YA EXISTENTES (conservar) ---
  /reservas            Reservaciones online (sistema actual)
  /paquetes            Catálogo de paquetes
  /extras              Extras contratables
  /meriendas           Opciones de snacks
  /horarios            Time slots
  /restaurante         Menú restaurante
  /galeria             Galería de fotos
```

---

## Schema de Base de Datos — Adiciones a Supabase

```sql
-- ============================================================
-- MÓDULO: CLIENTES
-- ============================================================
CREATE TABLE clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  telefono    TEXT,
  email       TEXT,
  rfc         TEXT,
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MÓDULO: COTIZACIONES
-- ============================================================
CREATE TYPE quote_status AS ENUM ('borrador','enviada','aprobada','rechazada','vencida');

CREATE TABLE quotes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio       TEXT UNIQUE NOT NULL,          -- QT-2026-001
  client_id   UUID REFERENCES clients(id),
  fecha       DATE NOT NULL,
  fecha_evento DATE,
  estado      quote_status DEFAULT 'borrador',
  subtotal    NUMERIC(12,2) DEFAULT 0,
  descuento   NUMERIC(12,2) DEFAULT 0,
  total       NUMERIC(12,2) DEFAULT 0,
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE quote_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id         UUID REFERENCES quotes(id) ON DELETE CASCADE,
  descripcion      TEXT NOT NULL,
  cantidad         NUMERIC(10,2) DEFAULT 1,
  precio_unitario  NUMERIC(12,2) DEFAULT 0,
  subtotal         NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);

-- ============================================================
-- MÓDULO: CONTRATOS
-- ============================================================
CREATE TYPE contract_status AS ENUM ('borrador','firmado','liquidado','cancelado');

CREATE TABLE contracts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio             TEXT UNIQUE NOT NULL,          -- CT-2026-001
  quote_id          UUID REFERENCES quotes(id),
  client_id         UUID REFERENCES clients(id),
  fecha_firma       DATE,
  fecha_evento      DATE NOT NULL,
  hora_inicio       TIME,
  hora_fin          TIME,
  salon_renta       NUMERIC(12,2) DEFAULT 0,
  total_contrato    NUMERIC(12,2) DEFAULT 0,
  deposito_pagado   NUMERIC(12,2) DEFAULT 0,
  saldo_pendiente   NUMERIC(12,2) GENERATED ALWAYS AS (total_contrato - deposito_pagado) STORED,
  estado            contract_status DEFAULT 'borrador',
  pdf_url           TEXT,
  notas             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Relación contrato ↔ reservación existente (migración gradual)
ALTER TABLE private_reservations ADD COLUMN contract_id UUID REFERENCES contracts(id);

-- ============================================================
-- MÓDULO: PROVEEDORES
-- ============================================================
CREATE TABLE suppliers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  categoria   TEXT,                                -- catering, decoración, A/V, etc.
  contacto    TEXT,
  telefono    TEXT,
  email       TEXT,
  notas       TEXT,
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MÓDULO: COMPRAS
-- ============================================================
CREATE TYPE purchase_status AS ENUM ('pendiente','recibida','cancelada');

CREATE TABLE purchases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio        TEXT UNIQUE NOT NULL,               -- OC-2026-001
  supplier_id  UUID REFERENCES suppliers(id),
  contract_id  UUID REFERENCES contracts(id),      -- NULL = gasto general
  fecha        DATE NOT NULL,
  total        NUMERIC(12,2) DEFAULT 0,
  estado       purchase_status DEFAULT 'pendiente',
  notas        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id      UUID REFERENCES purchases(id) ON DELETE CASCADE,
  descripcion      TEXT NOT NULL,
  cantidad         NUMERIC(10,2) DEFAULT 1,
  precio_unitario  NUMERIC(12,2) DEFAULT 0,
  subtotal         NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);

-- ============================================================
-- MÓDULO: INVENTARIO
-- ============================================================
CREATE TABLE inventory_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL,
  sku           TEXT UNIQUE,
  categoria     TEXT,
  unidad        TEXT DEFAULT 'pieza',              -- pieza, kg, litro, etc.
  stock_actual  NUMERIC(10,2) DEFAULT 0,
  stock_minimo  NUMERIC(10,2) DEFAULT 0,
  precio_costo  NUMERIC(12,2) DEFAULT 0,
  precio_venta  NUMERIC(12,2) DEFAULT 0,
  activo        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE movement_type AS ENUM ('entrada','salida','ajuste');

CREATE TABLE inventory_movements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID REFERENCES inventory_items(id),
  tipo         movement_type NOT NULL,
  cantidad     NUMERIC(10,2) NOT NULL,
  motivo       TEXT,
  contract_id  UUID REFERENCES contracts(id),      -- NULL = movimiento general
  purchase_id  UUID REFERENCES purchases(id),
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para actualizar stock_actual automáticamente
-- (implementar como Supabase function/trigger)

-- ============================================================
-- MÓDULO: PUNTO DE VENTA
-- ============================================================
CREATE TABLE pos_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   UUID REFERENCES contracts(id),     -- evento al que pertenece
  opened_at     TIMESTAMPTZ DEFAULT NOW(),
  closed_at     TIMESTAMPTZ,
  total_ventas  NUMERIC(12,2) DEFAULT 0,
  created_by    UUID REFERENCES auth.users(id)
);

CREATE TYPE payment_method AS ENUM ('efectivo','tarjeta','transferencia');

CREATE TABLE pos_sales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID REFERENCES pos_sessions(id),
  folio          TEXT NOT NULL,
  total          NUMERIC(12,2) DEFAULT 0,
  pagado_con     payment_method DEFAULT 'efectivo',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pos_sale_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          UUID REFERENCES pos_sales(id) ON DELETE CASCADE,
  item_id          UUID REFERENCES inventory_items(id),
  cantidad         NUMERIC(10,2) NOT NULL,
  precio_unitario  NUMERIC(12,2) NOT NULL,
  subtotal         NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);

-- ============================================================
-- MÓDULO: GASTOS ADMINISTRATIVOS
-- ============================================================
CREATE TABLE admin_expenses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria      TEXT NOT NULL,                    -- nómina, renta, servicios, marketing...
  descripcion    TEXT NOT NULL,
  monto          NUMERIC(12,2) NOT NULL,
  fecha          DATE NOT NULL,
  comprobante_url TEXT,                            -- Supabase Storage
  contract_id    UUID REFERENCES contracts(id),    -- NULL = gasto general del período
  supplier_id    UUID REFERENCES suppliers(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MÓDULO: ACTIVIDADES / TAREAS DEL STAFF
-- ============================================================
CREATE TYPE task_status AS ENUM ('pendiente','en_progreso','completado','cancelado');

CREATE TABLE event_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  UUID REFERENCES contracts(id) ON DELETE CASCADE,
  titulo       TEXT NOT NULL,
  descripcion  TEXT,
  asignado_a   UUID REFERENCES auth.users(id),
  hora_inicio  TIMESTAMPTZ,
  hora_fin     TIMESTAMPTZ,
  estado       task_status DEFAULT 'pendiente',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROLES DE USUARIO (extender user_profiles existente)
-- ============================================================
CREATE TYPE user_role AS ENUM ('owner','admin','staff','readonly');
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'readonly';
```

---

## Roadmap por Fases

### Fase 0 — Fundamentos y refactoring del Admin
**Estimado: 2 semanas**

#### Objetivos
- Restructurar el `AdminLayout` con sidebar completo (todos los módulos nuevos visibles, rutas vacías)
- Añadir todas las rutas nuevas en `admin.routes.ts` con componentes placeholder
- Crear interfaces TypeScript para todas las entidades nuevas en `core/interfaces/`
- Crear servicios base vacíos en `core/services/` para cada módulo nuevo
- Implementar roles granulares en Supabase y en el `adminGuard`
- Instalar dependencia `xlsx` para exportación a Excel

#### Archivos a crear
```
core/interfaces/
  client.ts
  quote.ts
  contract.ts
  supplier.ts
  purchase.ts
  inventory.ts
  pos.ts
  expense.ts
  event-task.ts

core/services/
  client.service.ts
  quote.service.ts
  contract.service.ts
  supplier.service.ts
  purchase.service.ts
  inventory.service.ts
  pos.service.ts
  expense.service.ts
  event-task.service.ts

features/admin/pages/
  admin-dashboard/
  admin-calendar/
  admin-clients/
  admin-quotes/
  admin-contracts/
  admin-events/
    event-detail/
    event-tasks/
    event-results/
  admin-inventory/
  admin-pos/
  admin-purchases/
  admin-suppliers/
  admin-expenses/
  admin-reports/
```

#### Decisiones de diseño
- El `AdminLayout` usará un sidebar colapsable con secciones agrupadas:
  - **Comercial:** Clientes, Cotizaciones, Contratos
  - **Operativo:** Calendario, Eventos, Actividades
  - **Inventario:** Existencias, Punto de Venta, Compras
  - **Financiero:** Gastos, Reportes, Dashboard
  - **Configuración:** Usuarios, Roles, Salón, Catálogos
- Componentes base reutilizables en `shared/components/`:
  - `DataTableBase` — tabla PrimeNG con filtros, paginación, exportación
  - `FormSidebar` — p-drawer lateral para crear/editar registros
  - `StatusBadge` — badge de estado con colores por tipo
  - `ConfirmDeleteDialog` — diálogo de confirmación reutilizable
  - `PdfPreviewDialog` — preview de PDF antes de descargar

---

### Fase 1 — Ciclo Comercial
**Estimado: 5 semanas | Impacto inmediato**

#### Semana 1-2: Módulo Clientes
- Tabla con búsqueda, filtros por nombre/teléfono/email
- Formulario crear/editar en `FormSidebar`
- Vista detalle: datos + historial de cotizaciones y contratos
- Contador de eventos y ticket promedio en la vista detalle

#### Semana 3: Módulo Cotizaciones
- Generador de cotizaciones con líneas de producto dinámicas
- Selector de cliente (autocomplete desde tabla `clients`)
- Cálculo automático de subtotal/descuento/total
- Estados: borrador → enviada → aprobada/rechazada
- Generación de PDF con jspdf (reutilizar `reservation-print.service.ts`)
- Botón "Convertir a Contrato" (una sola acción que crea el registro en `contracts`)

#### Semana 4-5: Módulo Contratos
- Vista lista con filtros por estado, fecha, cliente
- Formulario desde cotización aprobada (datos pre-llenados)
- Template de contrato configurable en `/admin/configuracion`
- PDF con campos del salón, cliente, fechas, montos, cláusulas
- Registro de pagos: anticipo inicial + abonos adicionales
- Timeline de pagos: qué se pagó, cuándo, cuánto falta
- Indicador visual de saldo pendiente (barra de progreso)

---

### Fase 2 — Control Financiero
**Estimado: 5 semanas | El diferenciador clave**

#### Semana 1-2: Proveedores + Compras
- CRUD proveedores con categorías
- Órdenes de compra con ítems dinámicos
- Vinculación opcional a un contrato/evento
- Estado de recepción: pendiente → recibida
- Resumen de gasto por proveedor

#### Semana 3: Gastos Administrativos
- Registro de gastos con categorías predefinidas (configurables)
- Upload de comprobantes a Supabase Storage
- Vinculación opcional a evento o período general
- Vista de gastos por mes con gráfica de barras (PrimeNG Charts)

#### Semana 4-5: Estado de Resultados por Evento
Página `/admin/eventos/:id/resultados` — el core financiero del sistema:

```
┌─────────────────────────────────────────┐
│  P&L — Contrato CT-2026-042             │
│  Boda García-Martínez  |  Sáb 14 Jun    │
├─────────────────────────────────────────┤
│  INGRESOS                               │
│    Renta del salón         $25,000      │
│    Paquete Premium          $8,500      │
│    Extras contratados       $2,300      │
│    Ventas POS (día evento)  $4,200      │
│    ─────────────────────────────────    │
│    TOTAL INGRESOS          $40,000      │
├─────────────────────────────────────────┤
│  COSTOS DIRECTOS                        │
│    Compras del evento       $6,800      │
│    Consumo de inventario    $1,500      │
│    ─────────────────────────────────    │
│    TOTAL COSTOS             $8,300      │
├─────────────────────────────────────────┤
│  UTILIDAD BRUTA            $31,700 79%  │
├─────────────────────────────────────────┤
│  GASTOS OPERATIVOS                      │
│    Nómina staff             $3,500      │
│    Gastos generales (% mes)   $2,800    │
│    ─────────────────────────────────    │
│    TOTAL GASTOS OP.         $6,300      │
├─────────────────────────────────────────┤
│  UTILIDAD NETA             $25,400 64%  │
└─────────────────────────────────────────┘
```

Nota técnica: este P&L se calcula en tiempo real desde múltiples tablas usando una **Supabase View** o **Edge Function**, no una tabla separada. Facilita exportación a PDF.

---

### Fase 3 — Operaciones
**Estimado: 4 semanas | Control del día del evento**

#### Semana 1-2: Inventario
- Catálogo de artículos con SKU, categoría, unidad de medida
- Registro de movimientos manuales (entrada/salida/ajuste)
- Entradas automáticas al recibir una compra (purchase → inventory)
- Alertas visuales de stock mínimo en el dashboard
- Kardex por artículo: historial de movimientos con saldo running

#### Semana 3: Punto de Venta
- Interfaz diseñada para tablet (grid de productos con foto/precio)
- Búsqueda rápida por nombre o SKU
- Carrito con cantidades ajustables
- Formas de pago: efectivo, tarjeta, transferencia
- Descuento automático de stock al confirmar venta
- Ticket PDF descargable (reutilizar jspdf)
- Vinculación a sesión del evento (para que aparezca en el P&L)

#### Semana 4: Actividades del Staff
- Lista de tareas por evento con responsable, hora, estado
- Vista del staff (rol limitado): solo ve sus tareas asignadas del día
- Drag-and-drop para reordenar prioridades (Angular CDK o PrimeNG)
- Notificaciones in-app cuando se asigna una tarea

---

### Fase 4 — Reportes y Analytics
**Estimado: 3 semanas | La parte más importante según el cliente**

#### Reportes a implementar

| Reporte | Filtros | Export |
|---------|---------|--------|
| Reporte de Eventos | fecha, estado, tipo | PDF, Excel |
| Estado de Resultados Global | mes/año | PDF, Excel |
| Pipeline Comercial | estado cotización, mes | PDF |
| Reporte de Clientes | fecha, ticket | Excel |
| Reporte de Proveedores | categoría, período | Excel |
| Reporte de Inventario | categoría, alertas | Excel |
| Reporte de Gastos | categoría, período | PDF, Excel |
| Flujo de Caja | período | PDF, Excel |

Todos los reportes comparten:
- Componente base `ReportPage` con header/filtros/tabla/footer estándar
- Botones PDF (jspdf) y Excel (xlsx)
- Gráficas con `p-chart` de PrimeNG (Chart.js bajo el capó)

---

### Fase 5 — Dashboard Maestro + Calendario
**Estimado: 2 semanas | Vista ejecutiva completa**

#### Calendario de Eventos
- Usar `p-fullcalendar` de PrimeNG (wrapper de FullCalendar v6)
- Vistas: mes, semana, día
- Color-coded por estado del contrato:
  - Gris: cotización en proceso
  - Amarillo: contratado / anticipo recibido
  - Verde: liquidado
  - Rojo: cancelado
- Click en evento → drawer lateral con resumen + links a detalle
- Bloqueos manuales de fechas (mantenimiento, fechas ocupadas)

#### Dashboard financiero + operativo
- **KPIs financieros:** ingresos del mes, eventos confirmados este mes, saldo total por cobrar, gasto total del mes
- **KPIs operativos:** próximos 7 días (lista de eventos), tareas pendientes hoy, artículos bajo stock mínimo
- **Gráfica principal:** ingresos vs. gastos por mes (últimos 12 meses)
- **Gráfica secundaria:** eventos por tipo (boda, XV, cumpleaños, corporativo, otro)
- **Alertas activas:** saldos vencidos, stock crítico, eventos sin staff asignado

---

## Estimación Total

| Fase | Semanas | Módulos principales |
|------|---------|---------------------|
| 0 - Fundamentos | 2 | Arquitectura, roles, nav, interfaces |
| 1 - Comercial | 5 | Clientes, Cotizaciones, Contratos |
| 2 - Financiero | 5 | Proveedores, Compras, Gastos, P&L |
| 3 - Operativo | 4 | Inventario, POS, Actividades Staff |
| 4 - Reportes | 3 | 8 reportes con exportación |
| 5 - Dashboard | 2 | Dashboard + Calendario |
| **Total** | **~21 sem** | **~5 meses** |

**MVP funcional (Fases 0+1+2):** ~12 semanas / 3 meses — suficiente para superar el demo de EventControl.

---

## Decisiones Técnicas y Convenciones

### Convenciones de código
- Todos los precios se almacenan en **pesos MXN con 2 decimales** (`NUMERIC(12,2)`) — no en centavos como el sistema anterior. Los módulos existentes de reservaciones siguen usando centavos; los módulos nuevos usan pesos directamente.
- Folios de documentos: `QT-YYYY-NNN` (cotizaciones), `CT-YYYY-NNN` (contratos), `OC-YYYY-NNN` (compras). Se generan con una Supabase function o en el service.
- Componentes Angular: standalone, `OnPush`, signals para estado local, `inject()` para dependencias. Sin inline templates.
- Formularios: siempre ReactiveFormsModule, nunca template-driven.
- Sin `ngClass` / `ngStyle` — usar class/style bindings con objetos.
- Control flow: `@if`, `@for`, `@switch` — nunca directivas estructurales.

### Librerías a agregar en Fase 0
```bash
bun add xlsx                   # exportación Excel
bun add @fullcalendar/core @fullcalendar/angular  # calendario (si p-fullcalendar no es suficiente)
```

### Supabase RLS (Row Level Security)
- Todos los módulos nuevos tendrán RLS activado
- Política por defecto: solo usuarios autenticados con `role IN ('owner','admin')` pueden leer/escribir
- Staff solo puede ver/actualizar `event_tasks` donde `asignado_a = auth.uid()`
- Readonly solo puede SELECT en las tablas que se les asigne explícitamente

### PDF generation
- Reutilizar el patrón de `reservation-print.service.ts` para todos los PDFs
- Template HTML → html2canvas → jspdf
- Diseñar templates HTML en componentes ocultos con clase `.pdf-template`

### Estado de Resultados (P&L)
- Implementar como **Supabase Database View** llamada `event_profit_loss`
- Joins entre: `contracts`, `quote_items`, `purchases` + `purchase_items`, `pos_sessions` + `pos_sales`, `inventory_movements`, `admin_expenses`
- El componente Angular solo hace un SELECT a esta view con el `contract_id`

---

## Progreso del Roadmap

### Fase 0 — Fundamentos
- [ ] Restructurar AdminLayout con sidebar completo (secciones agrupadas)
- [ ] Añadir rutas placeholder en admin.routes.ts
- [ ] Crear interfaces TypeScript para todas las entidades nuevas
- [ ] Crear servicios base para cada módulo nuevo
- [ ] Ejecutar migrations SQL en Supabase (schema completo arriba)
- [ ] Implementar roles granulares (user_profiles.role + adminGuard actualizado)
- [ ] Crear componentes base: DataTableBase, FormSidebar, StatusBadge
- [ ] Instalar dependencia xlsx

### Fase 1 — Ciclo Comercial
- [ ] Módulo Clientes (CRUD + detalle con historial)
- [ ] Módulo Cotizaciones (generador + PDF + conversión a contrato)
- [ ] Módulo Contratos (desde cotización + PDF + registro de pagos)

### Fase 2 — Control Financiero
- [ ] Módulo Proveedores
- [ ] Módulo Compras (vinculadas a evento o general)
- [ ] Módulo Gastos Administrativos
- [ ] P&L por evento (Supabase View + componente Angular)
- [ ] Dashboard financiero básico (KPIs del mes)

### Fase 3 — Operaciones
- [ ] Módulo Inventario (kardex + alertas de stock mínimo)
- [ ] Punto de Venta (POS táctil + descuento automático de stock)
- [ ] Actividades del Staff (tasks por evento + vista de staff)

### Fase 4 — Reportes
- [ ] Reporte de Eventos
- [ ] Estado de Resultados Global
- [ ] Pipeline Comercial
- [ ] Reporte de Clientes
- [ ] Reporte de Proveedores
- [ ] Reporte de Inventario
- [ ] Reporte de Gastos
- [ ] Flujo de Caja

### Fase 5 — Dashboard + Calendario
- [ ] Calendario de Eventos (p-fullcalendar, color-coded por estado)
- [ ] Dashboard maestro (KPIs financieros + operativos + gráficas + alertas)
- [ ] Bloqueos manuales de fechas en calendario

---

## Notas de Contexto

- El cliente compitió con EventControl (www.eventcontrol.com.mx), plataforma SaaS mexicana para salones, $699–$1,999 MXN/mes. El proyecto debe igualar o superar su oferta.
- La presentación de EventControl está en `Presentacion_Eventcontrol_2026.pdf` en la raíz.
- El módulo de **Reportes** es el más importante según el cliente — no escatimar esfuerzo ahí.
- El **P&L por evento** es el diferenciador central que el cliente necesita ver: renta del salón + adicionales - gastos operativos/admin = utilidad neta por evento.
- Los módulos de reservaciones online existentes (`/reservar/fiesta-privada`, `/reservar/play-day`) se conservan tal cual — son el canal de ventas público. Los nuevos módulos son internos del admin.
- A futuro: Facturación CFDI (SAT México) como Fase 6, y PWA/app móvil como Fase 7.
