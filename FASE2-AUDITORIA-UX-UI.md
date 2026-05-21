# Auditoría Completa UX/UI — Hula Hoop Event Platform
## Fase 2 — Estado Real del Sistema y Plan de Trabajo

**Fecha auditoría original:** 2026-05-21  
**Última actualización:** 2026-05-21  
**Contexto:** Revisión post-implementación. Se auditó el código fuente directamente para determinar el estado real de cada punto.

---

## Estado General del Sistema

Sistema production-grade: Angular 20+, SSR, Supabase, 23 páginas admin, sistema de reservas dual, wizard de cotizaciones de 6 pasos, búsqueda global, notificaciones en tiempo real. La mayoría de las recomendaciones de arquitectura ya están implementadas. Los gaps restantes son de experiencia pública (flujo del cliente) y consistencia visual menor.

---

## Diagnóstico por Punto — Estado Real

### Punto 1 — Sidebar orientado a tareas, no a entidades
**Estado: ✅ IMPLEMENTADO**

El sidebar en `admin-layout.ts` ya usa orientación por tareas:
```
Operaciones → Hoy, Calendario, Reservas, Eventos
Comercial   → Clientes, Cotizaciones, Contratos
Finanzas    → Gastos, Compras, POS, Reportes
Bodega      → Inventario, Proveedores
Catálogos   → Paquetes, Extras, Meriendas, Horarios, Galería
```
"Hoy" es el primer ítem y aparece prominente en la sección Operaciones.

---

### Punto 2 — Vista "Hoy" como pantalla de inicio operativa
**Estado: ✅ IMPLEMENTADO**

La página `admin-today` (`/admin/hoy`) existe con:
- Contratos del día y reservaciones del día
- KPIs: total eventos hoy, alertas activas (stock bajo, saldos vencidos)
- Contadores `lowStockCount` y `overdueCount` desde `ReportService`
- Vista de cards por evento con estado visual

**Gap menor:** Los cards de eventos del día no muestran el horario (hora_inicio/hora_fin) como en el wireframe original.

---

### Punto 3 — Filtros rápidos en tabla de reservas
**Estado: ✅ IMPLEMENTADO**

`admin-reservations` tiene:
- Quick chips por estado (Todas / Pendientes / Confirmadas / Completadas)
- Filtro por tipo (Privada / Play Day)
- Filtro por fecha de reserva
- Filtro por vencimiento de pago
- **Búsqueda de texto** por nombre, email y teléfono ← implementado en esta sesión
- `clearFilters()` resetea todos los filtros

---

### Punto 4 — Flujo de reserva pública (wizard con progreso)
**Estado: ⚠️ PARCIAL**

La página `private-reservation-page` usa `StepperModule` de PrimeNG (wizard con pasos). Existe el flujo estructurado. Sin embargo, faltan:

- **Disponibilidad visual en el calendario** (verde/amarillo/rojo por fecha)
- **Resumen de precio sticky** durante el wizard (sidebar desktop / footer mobile)
- **Página de confirmación celebratoria** con los próximos pasos claros

---

### Punto 5 — Sistema de badges unificado
**Estado: ✅ IMPLEMENTADO** *(centralizado en esta sesión)*

Se creó `src/app/core/utils/status-config.ts` como única fuente de verdad:
- `CONTRACT_STATUS` — borrador, firmado, liquidado, cancelado
- `QUOTE_STATUS` — borrador, enviada, aprobada, rechazada, vencida
- `RESERVATION_STATUS` — pending_payment, confirmed, completed, cancelled, expired
- `PURCHASE_STATUS` — pendiente, recibida, cancelada
- `getStatusCfg(estado, type)` — función exportada consumida por `admin-events.ts`

**Gap menor:** `admin-today.ts` y `admin-reservations.ts` aún tienen helpers de badge locales. Migrar en Sprint 1.

---

### Punto 6 — Checklist operativo "Modo Evento"
**Estado: ✅ IMPLEMENTADO**

La página `admin-event-checklist` existe en `/admin/evento/:id/checklist`. Accesible desde:
- El panel lateral de `admin-events` (tab Tareas, botón "Abrir checklist completo")
- El footer del panel de contrato (botón "Checklist")

---

### Punto 7 — Wizard de cotizaciones en 5–6 pasos
**Estado: ✅ IMPLEMENTADO**

`admin-quotes` tiene un wizard de 6 pasos completo:
1. Cliente + invitados
2. Fecha + turno (con disponibilidad live)
3. Paquete
4. Merienda
5. Extras
6. Resumen + anticipo + descuento

Incluye: PDF por `window.print()`, envío por WhatsApp y Email, flujo de estado borrador → enviada → aprobada (auto-convierte a contrato).

---

### Punto 8 — Mobile-first
**Estado: ⚠️ PARCIAL**

El admin layout es responsive con sidebar colapsable y drawer móvil. El checklist y la vista "Hoy" son usables en móvil. Los gaps:
- La tabla de `admin-reservations` tiene 11 columnas (excede recomendación de 8)
- Algunos formularios tienen 10+ campos sin colapso
- Falta verificar que todos los botones tengan min 44px de altura táctil

---

### Punto 9 — Onboarding zero-training (estados vacíos educativos)
**Estado: ⚠️ PARCIAL**

Algunos módulos tienen estados vacíos básicos. Faltan:
- **Estado vacío educativo con CTAs** en Reservas, Cotizaciones, Contratos
- **Tooltips en acciones irreversibles** (cancelar reserva, eliminar)
- **Botones primarios contextuales**: cotización aprobada → "Convertir a contrato"; contrato sin depósito → "Registrar pago"

---

### Punto 10 — Mejoras técnicas que impactan UX
**Estado: ✅ IMPLEMENTADO (todos)**

| Mejora | Estado |
|--------|--------|
| Búsqueda global Cmd+K | ✅ `GlobalSearch` component integrado en `admin-layout` |
| Filtros rápidos en tablas | ✅ Reservas, Eventos, Cotizaciones |
| Notificaciones en tiempo real | ✅ Supabase Realtime en `admin-layout` (nuevas reservas) |
| FAB "Nueva reserva" desde cualquier página | ✅ `fabOpen` signal + FAB en `admin-layout` |
| Exportar a PDF/Excel | ✅ En Reportes y en detalle de reserva |
| Historial de cambios | ❌ No implementado |

---

## Resumen de Estado

| # | Punto | Estado |
|---|-------|--------|
| 1 | Sidebar orientado a tareas | ✅ Completo |
| 2 | Vista "Hoy" | ✅ Completo |
| 3 | Filtros + búsqueda en reservas | ✅ Completo |
| 4 | Wizard reserva pública | ⚠️ Parcial |
| 5 | Sistema de badges centralizado | ✅ Completo |
| 6 | Checklist operativo | ✅ Completo |
| 7 | Wizard cotizaciones | ✅ Completo |
| 8 | Mobile-first | ⚠️ Parcial |
| 9 | Onboarding zero-training | ⚠️ Parcial |
| 10 | Búsqueda global + Realtime + FAB | ✅ Completo |

**7 de 10 puntos completamente implementados. 3 parciales.**

---

## Plan de Trabajo — Gaps Restantes

### Sprint A — Consistencia interna (1–2 horas)

**A1. Migrar badges locales a `getStatusCfg`**
- `admin-today.ts` — eliminar `StatusConfig` local, usar `getStatusCfg`
- `admin-reservations.ts` — reemplazar `getStatusConfig()` local por `getStatusCfg`

**A2. Horario en cards de Vista "Hoy"**
- `admin-today.html` — mostrar `hora_inicio`–`hora_fin` en cada card de evento del día

---

### Sprint B — Flujo público del cliente (3–5 horas)

**B1. Resumen de precio sticky en wizard de reserva pública**
- `private-reservation-page` — agregar sidebar (desktop) / sticky footer (mobile) con desglose en tiempo real: paquete + extras seleccionados + anticipo requerido
- Se actualiza reactivamente conforme el cliente avanza en los pasos

**B2. Disponibilidad visual en el calendario público**
- En el step de fecha del wizard, marcar las fechas del `<input type="date">` o el componente de calendario con clases visuales:
  - Sin bloqueado → verde
  - Pocos turnos libres → amarillo
  - Todos los turnos bloqueados → rojo / deshabilitado
- Consume `ReservationService.isSlotBlockedByPrivate()` para cada fecha del mes visible

**B3. Página de confirmación celebratoria**
- Reemplazar o mejorar la pantalla post-reserva con:
  - Encabezado celebratorio "¡Reserva confirmada!"
  - Línea de tiempo: anticipo recibido ✅ → liquidar N días antes ⏳ → evento 🎉
  - Acceso al token de seguimiento
  - Botón para agendar recordatorio en Google Calendar (deep link)

---

### Sprint C — Onboarding y micro-UX (2–3 horas)

**C1. Estados vacíos educativos con CTAs**
- `admin-reservations.html` — cuando `filteredRows().length === 0` y no hay filtros activos, mostrar: "Aún no hay reservas. ¿Quieres crear una?" con botones [+ Nueva cotización] [+ Reserva directa]
- `admin-quotes.html` — cuando lista vacía: "Crea tu primera cotización con el wizard"
- `admin-contracts.html` — cuando lista vacía: "Los contratos se crean al aprobar una cotización"

**C2. Botones primarios contextuales en panel de detalle**
- En `admin-events` panel lateral:
  - Si contrato en estado `borrador` → mostrar botón "Registrar firma" prominente
  - Si contrato `firmado` con saldo > 0 → mostrar botón "Registrar pago" prominente
  - Si reserva `pending_payment` → mostrar botón "Registrar anticipo" que navega a reservas con el dialog de pago abierto

**C3. Tooltip en acciones irreversibles**
- Cancelar reserva / contrato → tooltip o confirmación con texto: "Esta acción no se puede deshacer"
- Ya existe `ConfirmationService` de PrimeNG en `admin-reservations`, replicar en contratos y cotizaciones donde aún no esté

---

### Sprint D — Mobile polish (1–2 horas)

**D1. Cards en lugar de tabla para reservas en móvil**
- `admin-reservations.html` — en pantallas `<768px` renderizar cards apiladas en lugar de la tabla de 11 columnas
- Usar breakpoint de Tailwind: `@if` con señal de `window.innerWidth` o CSS-only con `hidden sm:block` / `block sm:hidden`

**D2. Validar altura táctil de botones**
- Revisar que todos los botones en páginas de uso frecuente (Hoy, Reservas, Eventos) tengan `min-h-[44px]` o `py-2.5` mínimo

---

## Prioridad sugerida

| Sprint | Impacto | Esfuerzo | Prioridad |
|--------|---------|----------|-----------|
| A — Consistencia interna | Medio | Bajo | Hacer primero (deuda técnica) |
| B — Flujo público | Alto | Medio | Impacta conversión de clientes |
| C — Onboarding | Medio | Medio | Reduce curva de capacitación |
| D — Mobile polish | Medio | Bajo | Usabilidad del staff en evento |
