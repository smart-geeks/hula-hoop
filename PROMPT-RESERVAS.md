# Prompt: Sistema de Reservas — Hula Hoop

## Contexto del proyecto

Hula Hoop es un playground infantil en México. La web está construida con **Angular 21** (SSR, zoneless), **Tailwind CSS**, **PrimeNG 21** y **Supabase** como backend (Auth + DB + Edge Functions). El pago se hará con **Mercado Pago**.

### Stack actual
- Angular 21 (SSR, zoneless) + Tailwind CSS + PrimeNG 21
- Fuentes: Fredoka (display/títulos), Nunito (body/texto)
- Colores Tailwind custom: lima, rosa-pastel, azul-cielo, morado, rojo-brillante, naranja, marron, amarillo-merengue, neutro
- Theme preset PrimeNG: `src/app/theme/hula-hoop-preset.ts`
- Supabase Auth con `@supabase/supabase-js` v2 (NO `@supabase/ssr`)
- SSR safety: `SupabaseService` usa `isPlatformBrowser` guard; el client es `null` en server

### Estructura existente del proyecto
```
src/app/
├── app.ts, app.config.ts, app.routes.ts
├── core/
│   ├── guards/auth.guard.ts
│   ├── interfaces/user-profile.ts
│   └── services/
│       ├── auth.service.ts        # Expone signals: isLoggedIn, isAdmin, currentUser, userProfile
│       └── supabase.service.ts    # Wrapper con isPlatformBrowser guard
├── features/
│   ├── auth/pages/update-password/
│   └── home/
│       ├── components/
│       │   ├── hero-section/
│       │   ├── home-footer/
│       │   ├── private-events-section/   # Sección fiestas privadas (maquetada)
│       │   ├── schedule-section/         # Sección horarios informativos (maquetada)
│       │   └── play-day-section/         # Sección play day público (maquetada)
│       └── pages/home-page/
├── shared/components/
│   ├── auth-dialog/    # Dialog login/register/forgot
│   └── topbar/
├── theme/hula-hoop-preset.ts
└── environments/environment.ts
```

### Rutas actuales
```typescript
{ path: '', loadComponent: () => import('./features/home/pages/home-page/home-page').then(m => m.HomePage) },
{ path: 'auth/update-password', loadComponent: () => import('./features/auth/pages/update-password/update-password-page').then(m => m.UpdatePasswordPage) },
```

### Base de datos actual (Supabase)
Solo existe la tabla `profiles`:
- `id` (uuid PK, FK → auth.users.id)
- `full_name` (text)
- `email` (text)
- `phone` (text nullable)
- `role` (text, check: 'user' | 'admin', default 'user')
- `created_at`, `updated_at` (timestamptz)
- RLS habilitado
- 2 perfiles existentes
- Timezone del servidor: UTC

---

## Herramientas MCP disponibles — DEBES usarlas

### Angular CLI MCP
- **SIEMPRE** usa `list_projects` como primer paso para obtener el workspace path.
- **SIEMPRE** usa `get_best_practices` con el workspace path antes de escribir o modificar código Angular para seguir las convenciones de Angular 21.
- Usa `search_documentation` y `find_examples` para buscar APIs y patrones modernos.

### PrimeNG MCP
- **SIEMPRE** usa las herramientas de PrimeNG (`get_component`, `get_component_import`, `get_usage_example`, etc.) antes de usar cualquier componente PrimeNG.
- Los imports son `primeng/<component>` (e.g. `ButtonModule` from `primeng/button`).
- **CUIDADO**: el MCP a veces devuelve casing incorrecto. Usa `FloatLabelModule` (no `FloatlabelModule`), `InputMaskModule` (no `InputmaskModule`).

### Supabase MCP (SOLO LECTURA)
- Puedes usar `list_tables`, `execute_sql` (SELECT), `list_migrations`, `search_docs`, `get_advisors` para consultar y verificar.
- **NO puedes ejecutar DDL ni crear Edge Functions directamente**. Para todo lo que sea crear tablas, migraciones, RLS policies, Edge Functions o cualquier escritura en Supabase: **redacta el SQL o código completo y entrégamelo para que yo lo ejecute manualmente**. Usa bloques de código claros con instrucciones paso a paso.

---

## Modelo de negocio

### Fiestas Privadas (prioridad del negocio)
- Diferentes **paquetes** según número de personas, cada uno con precio.
- Cada paquete incluye: Merienda, Bebida Refill, Host, Actividades, Vajilla, Piñata, 3 Horas de Evento, Asistentes Playground (esto se guarda como `inclusions` jsonb en cada paquete, el admin puede personalizarlos).
- **Extras** con precio individual que se suman al total (admin los gestiona: crear, editar, eliminar, deshabilitar).
- Reserva mínimo 24 horas antes del horario.

### Play Day / Fiestas Públicas
- Juego abierto al público cuando NO hay fiesta privada reservada en ese horario.
- Precio actual: 190 MXN (1 niño + 1 adulto). Adulto extra: 60 MXN. Estos precios los edita el admin.
- Controlado por capacidad máxima del local por horario (configurable por admin).

### Horarios (compartidos para ambos tipos)
- **Entre semana** (Lun-Vie): 4:00 PM - 7:00 PM (1 sesión)
- **Fines de semana** (Sáb-Dom): 9:30 AM - 12:30 PM, 1:00 PM - 3:00 PM, 3:30 PM - 6:30 PM (3 sesiones)
- Los mismos horarios aplican para fiestas privadas y play day.
- Si una fiesta privada reserva un horario, ese horario NO está disponible para play day.

### Zona horaria
- Todo se maneja en zona horaria de México (`America/Mexico_City`).
- Supabase almacena en UTC. Las fechas de reserva son tipo `DATE` y los horarios de slots son tipo `TIME` (sin timezone, siempre representan hora local de México).
- La conversión se hace en el frontend.

---

## Arquitectura de base de datos aprobada

### Tablas a crear

**`time_slots`** — Horarios disponibles (seed inicial con 4 filas, pero el admin puede crear, editar y eliminar horarios libremente)
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK (gen_random_uuid) | |
| day_type | text CHECK ('weekday','weekend') | |
| start_time | time | Hora local México |
| end_time | time | Hora local México |
| is_active | boolean DEFAULT true | Admin puede desactivar |
| created_at | timestamptz DEFAULT now() | |

**`packages`** — Paquetes de fiesta privada
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | |
| description | text | |
| min_guests | int NOT NULL | |
| max_guests | int NOT NULL | |
| price_cents | int NOT NULL | Precio en centavos MXN |
| inclusions | jsonb DEFAULT '[]' | Array de strings: ["Merienda", "Piñata", ...] |
| is_active | boolean DEFAULT true | |
| sort_order | int DEFAULT 0 | |
| created_at, updated_at | timestamptz | |

**`extras`** — Extras para fiesta privada
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | |
| description | text | |
| price_cents | int NOT NULL | |
| is_active | boolean DEFAULT true | |
| sort_order | int DEFAULT 0 | |
| created_at, updated_at | timestamptz | |

**`venue_config`** — Configuración del local (1 sola fila)
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| max_capacity_per_slot | int NOT NULL DEFAULT 50 | |
| playdate_ticket_price_cents | int NOT NULL DEFAULT 19000 | 190 MXN |
| playdate_extra_adult_price_cents | int NOT NULL DEFAULT 6000 | 60 MXN |
| min_hours_before_private | int NOT NULL DEFAULT 24 | Horas mínimas para reservar privada |
| private_booking_horizon_date | date | Fecha límite hasta la cual se aceptan reservas privadas. Si es NULL, no hay límite. El admin la configura (ej: 2026-04-15 significa que solo se puede reservar fiesta privada hasta el 15 de abril de 2026). El calendario de reserva privada bloquea fechas posteriores a esta. |
| updated_at | timestamptz | |
| updated_by | uuid FK → profiles.id | |

**`private_reservations`** — Reservas de fiestas privadas
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| profile_id | uuid FK → profiles.id NULLABLE | NULL si reserva sin sesión |
| guest_name | text NOT NULL | |
| guest_email | text NOT NULL | |
| guest_phone | text NOT NULL | |
| reservation_date | date NOT NULL | |
| time_slot_id | uuid FK → time_slots.id | |
| package_id | uuid FK → packages.id | |
| guest_count | int NOT NULL | |
| subtotal_cents | int NOT NULL | Precio paquete |
| total_cents | int NOT NULL | Paquete + extras |
| status | text CHECK ('pending_payment','confirmed','completed','cancelled','expired') DEFAULT 'pending_payment' | |
| mp_preference_id | text | ID preferencia Mercado Pago |
| mp_payment_id | text | ID pago Mercado Pago |
| access_token | uuid UNIQUE DEFAULT gen_random_uuid() | Para ver reserva sin auth |
| notes | text | |
| created_at, updated_at | timestamptz | |

**`private_reservation_extras`** — Extras de cada reserva privada
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| reservation_id | uuid FK → private_reservations.id ON DELETE CASCADE | |
| extra_id | uuid FK → extras.id | |
| quantity | int NOT NULL DEFAULT 1 | |
| unit_price_cents | int NOT NULL | Snapshot del precio al reservar |

**`playdate_reservations`** — Reservas de play day
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| profile_id | uuid FK → profiles.id NULLABLE | |
| guest_name | text NOT NULL | |
| guest_email | text NOT NULL | |
| guest_phone | text NOT NULL | |
| reservation_date | date NOT NULL | |
| time_slot_id | uuid FK → time_slots.id | |
| kids_count | int NOT NULL DEFAULT 1 | |
| adults_count | int NOT NULL DEFAULT 1 | |
| extra_adults_count | int NOT NULL DEFAULT 0 | |
| total_cents | int NOT NULL | |
| status | text CHECK ('pending_payment','confirmed','completed','cancelled','expired') DEFAULT 'pending_payment' | |
| mp_preference_id | text | |
| mp_payment_id | text | |
| access_token | uuid UNIQUE DEFAULT gen_random_uuid() | |
| created_at, updated_at | timestamptz | |

### RLS (Row Level Security)
- `time_slots`, `packages`, `extras`, `venue_config`: lectura pública (anon), escritura solo admin.
- `private_reservations`, `playdate_reservations`: insertar anon (para reservas sin login), leer por profile_id o por access_token, update solo admin o por mp webhook (service_role).
- `private_reservation_extras`: misma política que su reserva padre.

### Seed data
- 4 time_slots iniciales (seed): 1 weekday (16:00-19:00), 3 weekend (09:30-12:30, 13:00-15:00, 15:30-18:30). El admin podrá agregar, editar o eliminar horarios desde el panel.
- 1 fila venue_config con defaults (capacity 50, ticket 19000, extra_adult 6000, min_hours 24)

---

## Flujo de reservas

### Reserva Fiesta Privada — Página `/reservar/fiesta-privada`
Wizard multi-step:
1. **Fecha y horario**: Calendario para seleccionar fecha + selector de horario disponible. El calendario tiene como fecha mínima mañana (regla 24h) y como fecha máxima `venue_config.private_booking_horizon_date` (si está definida). Solo se muestran slots sin reserva privada confirmada.
2. **Paquete**: Seleccionar paquete según número de invitados, ver precio e inclusiones
3. **Extras**: Seleccionar extras opcionales con cantidad, ver subtotal en tiempo real
4. **Datos y resumen**: Nombre, email, teléfono (pre-llenado si hay sesión) + resumen con desglose de precio total
5. **Pago**: Crear reserva → crear preferencia Mercado Pago → redirigir a pago → webhook confirma

### Reserva Play Day — Página `/reservar/play-day`
Formulario más simple:
1. Seleccionar fecha
2. Ver horarios disponibles (slots sin fiesta privada confirmada y con capacidad)
3. Seleccionar horario, indicar número de niños, adultos, adultos extra
4. Datos de contacto + resumen con precio
5. Pago vía Mercado Pago

### Con/sin sesión
- **Sin sesión**: Se piden datos de contacto en el formulario. Se genera `access_token`. Post-pago se muestra link `/reserva/:accessToken` y se envía email de confirmación.
- **Con sesión**: Datos pre-llenados del perfil. Reserva vinculada a `profile_id`. Página `/mi-cuenta/reservas` con historial.

### Flujo de pago (Mercado Pago)
```
Frontend crea reserva (status: pending_payment)
  → Edge Function `create-payment` crea preference en MP → devuelve URL
  → Redirige usuario a Mercado Pago
  → Usuario paga → MP redirige a /reserva/:accessToken?status=approved
  → Edge Function `mp-webhook` recibe IPN → actualiza status a confirmed
  → Se envía email de confirmación (futuro)
```

### Control de capacidad
Para un `reservation_date` + `time_slot_id`:
- Si hay `private_reservations` confirmada → slot **bloqueado** para play day
- Si no hay privada → capacidad disponible = `venue_config.max_capacity_per_slot` - SUM(kids_count + adults_count + extra_adults_count) de playdate_reservations confirmadas
- Regla 24h: si faltan < `min_hours_before_private` horas → no se puede reservar privada, solo play day
- **Horizonte de reserva privada**: si `venue_config.private_booking_horizon_date` está definida, no se pueden crear reservas privadas con `reservation_date` posterior a esa fecha. El calendario bloquea fechas fuera de rango. El admin gestiona este campo desde Configuración.

---

## Rutas a crear
```typescript
{ path: 'reservar/fiesta-privada', loadComponent: () => import('...').then(m => m.PrivateReservationPage) },
{ path: 'reservar/play-day', loadComponent: () => import('...').then(m => m.PlaydayReservationPage) },
{ path: 'reserva/:accessToken', loadComponent: () => import('...').then(m => m.ReservationDetailPage) },
{ path: 'mi-cuenta/reservas', loadComponent: () => import('...').then(m => m.MyReservationsPage), canActivate: [authGuard] },
{ path: 'admin', loadChildren: () => import('...').then(m => m.adminRoutes), canActivate: [adminGuard] },
```

Admin sub-rutas:
- `admin/reservas` — Ver y gestionar todas las reservas
- `admin/paquetes` — CRUD paquetes
- `admin/extras` — CRUD extras
- `admin/configuracion` — Precios, capacidad, horarios, horizonte de reservas privadas (fecha límite)

---

## Fases de implementación — SIGUE ESTE ORDEN

### Fase 1: Base de datos
Entréga las migraciones SQL completas para:
1. Crear tablas: `time_slots`, `packages`, `extras`, `venue_config`
2. Crear tablas: `private_reservations`, `private_reservation_extras`, `playdate_reservations`
3. RLS policies para todas las tablas
4. Seed data (time_slots + venue_config)
5. Trigger para `updated_at` automático

**No escribas código Angular en esta fase.** Solo SQL. Entrégamelo para que yo lo ejecute en Supabase.

### Fase 2: Servicios Angular + tipos
1. Generar tipos TypeScript desde el schema de Supabase
2. Crear servicios: `TimeSlotService`, `PackageService`, `ExtraService`, `VenueConfigService`, `ReservationService`
3. Interfaces/tipos para las entidades

### Fase 3: Admin básico
1. Layout admin con sidebar/nav
2. CRUD paquetes (tabla + formulario dialog)
3. CRUD extras (tabla + formulario dialog)
4. Editar configuración venue (precios, capacidad)
5. CRUD time_slots: crear nuevos horarios, editar existentes, eliminar, activar/desactivar. El admin debe poder gestionar horarios tanto de entre semana como de fines de semana libremente (agregar más sesiones, cambiar horas, quitar horarios, etc.)

### Fase 4: Reserva fiesta privada
1. Página wizard multi-step
2. Selección de fecha + horario disponible
3. Selección de paquete + extras
4. Formulario datos contacto + resumen
5. Integración Mercado Pago (Edge Function + webhook)

### Fase 5: Reserva play day
1. Página de reserva
2. Disponibilidad real por slots
3. Selector de cantidad personas
4. Pago vía Mercado Pago

### Fase 6: Cuenta de usuario
1. Página `/mi-cuenta/reservas` con historial
2. Página `/reserva/:accessToken` para ver detalle (con/sin sesión)

### Fase 7: Admin avanzado
1. Dashboard de reservas (lista con filtros)
2. Cambiar status de reservas
3. Vista calendario (futuro)

---

## Reglas estrictas de calidad

1. **Paso a paso**: Completa UNA fase a la vez. Al terminar cada fase, espera mi confirmación antes de continuar.
2. **No hagas todo de golpe**: Dentro de cada fase, trabaja en bloques pequeños y verificables.
3. **Código profesional**: Tipos estrictos, sin `any`, manejo de errores, accesibilidad WCAG AA.
4. **Mobile first**: Todo debe verse perfecto en móvil primero, luego adaptar a desktop.
5. **Signals**: Usa signals para estado, `computed()` para derivados, `inject()` para DI.
6. **OnPush + external templates**: Siempre. Nunca inline templates.
7. **Reactive Forms**: Para todos los formularios.
8. **Tailwind + colores del tema**: Usa los colores custom definidos en `src/styles.css`.
9. **PrimeNG 21**: Consulta siempre el MCP antes de usar un componente.
10. **Angular 21**: NO pongas `standalone: true`. Consulta `get_best_practices` del MCP Angular.
11. **Supabase readonly**: Todo SQL de escritura o Edge Functions me lo entregas como bloque de código.
12. **Textos en español**: Toda la UI está en español.
13. **Precios en centavos**: Almacenar en centavos (int), formatear en el frontend con pipe.

---

## Empieza por la Fase 1

Genera las migraciones SQL completas (DDL + seed + RLS) para todas las tablas del sistema de reservas. Entrégamelas organizadas y listas para ejecutar en Supabase.
