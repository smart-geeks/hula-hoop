# Diseño: Cards de Hitos en Página de Detalle de Evento

**Fecha:** 2026-06-15  
**Archivo objetivo:** `src/app/features/admin/pages/admin-event-detail/`

---

## Problema

La página de detalle de evento (`/admin/evento/:id`) muestra una barra de progreso lineal 1→2→3→4 (Cotizado → Contratado → Liquidado → Concluido). Este modelo asume un flujo secuencial que en la práctica no siempre se cumple — los pagos, documentos y tareas ocurren en cualquier orden. El staff necesita ver el estado real del evento de un vistazo, sin navegar por tabs.

---

## Solución

Reemplazar la barra de progreso por 4 **cards de hitos** que muestran el estado real de cada área del evento. Los tabs existentes permanecen sin cambios — las cards son un resumen clickeable que activa el tab correspondiente.

---

## Estructura de la página

```
┌─ HEADER ─────────────────────────────────────────────┐
│  ← Volver   HH-2025-001   [Estado badge]   $18,000  │
└──────────────────────────────────────────────────────┘

┌─ CARDS DE HITOS (nuevo, reemplaza la progress bar) ──┐
│  [CONTRATO]  [PAGOS]  [TAREAS]  [GASTOS]             │
│  grid-cols-4 desktop · grid-cols-2 tablet ·          │
│  scroll horizontal en móvil                          │
└──────────────────────────────────────────────────────┘

┌─ TABS (sin cambio) ──────────────────────────────────┐
│  Resumen │ Contrato │ Pagos │ Cotización │ Tareas │  │
│  Gastos                                              │
└──────────────────────────────────────────────────────┘

┌─ CONTENIDO DEL TAB ACTIVO ───────────────────────────┐
│  (igual que hoy)                                     │
└──────────────────────────────────────────────────────┘
```

---

## Las 4 cards

Cada card es un `<button>` que llama a `setTab()` y hace scroll hasta la sección de tabs. Tiene: ícono + título, 2-3 datos clave, badge de estado con color.

### Card 1 — CONTRATO → activa tab `contrato`

Datos mostrados:
- INE: ✓ subido / ✗ falta
- Comprobante de domicilio: ✓ subido / ✗ falta
- Firma del cliente: ✓ firmado / ✗ pendiente (considera `firma_url` o `pdf_url`)

Estado:
- **Verde:** los 3 documentos presentes
- **Ámbar:** falta al menos uno

### Card 2 — PAGOS → activa tab `pagos`

Datos mostrados:
- Total del contrato
- Total pagado
- Saldo pendiente
- Mini barra de progreso + porcentaje

Estado:
- **Verde:** `saldo_pendiente === 0`
- **Ámbar:** `saldo_pendiente > 0`

### Card 3 — TAREAS → activa tab `tareas`

Datos mostrados:
- "X de Y completadas"
- Mini barra de progreso + porcentaje

Estado:
- **Verde:** todas completadas y `tasks.length > 0`
- **Ámbar:** hay tareas pendientes
- **Gris:** `tasks.length === 0` (sin tareas configuradas)

### Card 4 — GASTOS → activa tab `gastos`

Datos mostrados:
- Total acumulado de gastos (si hay)
- Si `totalExpenses === 0`: mensaje inteligente "¿Recuerdas registrar los gastos del evento?"

Estado:
- **Verde (neutral):** `totalExpenses > 0` — muestra el total
- **Ámbar (recordatorio):** `totalExpenses === 0` — muestra el aviso

---

## Lógica de estado (computed signals)

Los signals existentes (`saldoPendiente`, `taskProgress`, `totalExpenses`, `completedTaskCount`) se reutilizan. Se agregan:

```typescript
readonly documentosCompletos = computed(() => {
  const c = this.contract();
  if (!c) return false;
  const tieneFirma = !!(c.firma_url || c.pdf_url);
  return !!(c.ine_url && c.comprobante_url && tieneFirma);
});

readonly contratoStatus = computed((): 'completo' | 'pendiente' => {
  return this.documentosCompletos() ? 'completo' : 'pendiente';
});

readonly tareasStatus = computed((): 'completo' | 'pendiente' | 'sin-tareas' => {
  const total = this.tasks().length;
  if (total === 0) return 'sin-tareas';
  return this.completedTaskCount() === total ? 'completo' : 'pendiente';
});
```

---

## Base de datos — Migración requerida

La tabla `contracts` tiene solo `pdf_url`. Las columnas `firma_url`, `ine_url` y `comprobante_url` están declaradas en la interfaz TypeScript pero **no existen en la BD**. Se requiere:

```sql
-- Archivo: supabase/migrations/20260615000001_add_contract_document_columns.sql
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS firma_url       TEXT,
  ADD COLUMN IF NOT EXISTS ine_url         TEXT,
  ADD COLUMN IF NOT EXISTS comprobante_url TEXT;
```

Esta migración es no-destructiva: columnas nuevas en `NULL`, contratos existentes no se afectan.

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/20260615000001_add_contract_document_columns.sql` | Nuevo — agrega 3 columnas |
| `admin-event-detail.ts` | Eliminar `LIFECYCLE_STEPS`, `currentStep`, `stepProgressWidth`; agregar `documentosCompletos`, `contratoStatus`, `tareasStatus` |
| `admin-event-detail.html` | Reemplazar bloque de progress bar por 4 cards; agregar `id="tabs-section"` al div de los tabs para que el scroll funcione |

---

## Lo que NO cambia

- Los 6 tabs y su contenido interno
- Los dialogs de pago, gasto y tarea
- El header del evento
- La lógica de `isLocked`
- Los computed signals existentes (`saldoPendiente`, `pagoProgress`, `taskProgress`, `totalExpenses`)
