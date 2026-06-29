# Diseño: Vista Unificada de Cotización

**Fecha:** 2026-06-28
**Autor:** Eduardo Baltazar + Claude

---

## Objetivo

Crear una vista unificada de cotización — limpia, legible, dividida en secciones — que sirva como fuente de verdad visual en todos los contextos donde se muestra una cotización: la lista `/admin/cotizaciones`, la pestaña "Cotización" del evento, y cualquier pantalla futura que necesite mostrar una cotización.

## Alcance

Cuatro entregables coordinados:

1. **`QuoteDetailComponent`** — componente compartido de solo lectura que contiene toda la presentación
2. **Página `/admin/cotizaciones/:id`** — nueva página que envuelve el componente + barra de acciones
3. **Pestaña "Cotización" en `admin-event-detail`** — embebe el componente; la lógica de addendum queda intacta
4. **Wizard enhancement** — Step 4 gana soporte para líneas personalizadas (texto libre + precio)

---

## Arquitectura

```
QuoteDetailComponent  (src/app/shared/components/quote-detail/)
  ↑ usado por
  ├── AdminQuoteView   (src/app/features/admin/pages/admin-quote-view/)
  │     ruta: /admin/cotizaciones/:id
  └── admin-event-detail.html  "Cotización" tab
        ↓ amendment logic stays here, unchanged
```

**Regla de contexto:**
- Sin contrato asociado → acciones: Editar (wizard), Enviar, Imprimir
- Con contrato → acciones: Ir al evento, Imprimir. Modificar cotización solo desde el evento (flujo addendum)

---

## 1. `QuoteDetailComponent`

### Ubicación
```
src/app/shared/components/quote-detail/
  quote-detail.ts
  quote-detail.html
```

### API del componente

```typescript
// Inputs
quote          = input.required<Quote>();
contract       = input<Contract | null>(null);
showActions    = input<boolean>(true);   // false cuando se embebe en el evento

// La Quote debe venir con sus relaciones cargadas:
// quote.client, quote.items
// El Contract debe venir con contract.payments
```

### Secciones (de arriba hacia abajo)

**1. Cabecera**
- Folio en tipografía monoespaciada grande (`font-mono text-2xl font-bold`)
- Fecha de emisión en secundario
- Badge de estado: borrador / enviada / aprobada / rechazada / vencida

**2. Tarjeta: Cliente + Evento** (2 columnas en pantallas ≥ md)
- Columna izquierda — Cliente:
  - Nombre completo
  - Teléfono (si existe)
  - Email (si existe)
- Columna derecha — Evento:
  - Fecha del evento (`fecha_evento`) formateada: "Sábado 14 de febrero de 2026"
  - Horario (`hora_inicio` – `hora_fin`)
  - Número de invitados (`guest_count`)
  - Salón (nombre del venue — usar el venue del contrato si disponible, de lo contrario omitir)

**3. Conceptos**

Items agrupados por categoría. La categoría se detecta por prefijo de descripción (lógica ya existente en `admin-event-detail`):
- `Merienda:` → "Merienda"
- `Upgrade de Decoración:` → "Decoración"
- `Actividad Premium:` / `Actividad Incluida:` → "Experiencia"
- `Área Glam Girls` → "Glam Girls"
- Extras del catálogo (sin prefijo especial) → "Extras"
- Todo lo demás → "Paquete" (primer ítem) o sin categoría

Cada ítem muestra:
- Descripción limpia (sin prefijo técnico donde corresponda)
- Cantidad × precio unitario (si cantidad > 1)
- Subtotal alineado a la derecha
- Si `precio_unitario === 0` → mostrar badge "Incluido" en verde en lugar del precio

**4. Totales**
- Subtotal
- Descuento (solo si `descuento > 0`): "– $X,XXX"
- Línea divisoria
- **Total** en grande y bold
- Anticipo requerido (si `deposit_amount > 0`): en color rojo/brand
- Saldo al evento (si `deposit_amount > 0`): `total - deposit_amount`

**5. Notas** (solo si `notas` no es null/vacío)
- Sección con fondo tenue, texto en slate-700

**6. Estado del contrato** (solo si `contract !== null`)
- Estado del contrato con badge de color
- Total del contrato
- Total pagado (suma de `contract.payments`)
- Saldo pendiente
- Esta sección es estrictamente informativa (solo lectura)

### Reglas Angular
- NO `standalone: true`
- `ChangeDetectionStrategy.OnPush`
- Template externo `.html`
- `input()` / `input.required()` — no decoradores `@Input()`
- `computed()` para derived state (categorías, saldo contrato, etc.)
- `| currency:'MXN':'symbol-narrow':'1.0-0'` para montos — sin parámetro de locale
- `@if`, `@for`, `@switch` — nunca `*ngIf`, `*ngFor`

---

## 2. Página `/admin/cotizaciones/:id`

### Archivos nuevos
```
src/app/features/admin/pages/admin-quote-view/
  admin-quote-view.ts
  admin-quote-view.html
```

### Ruta a agregar en `admin.routes.ts`
```typescript
{
  path: 'cotizaciones/:id',   // BEFORE 'cotizaciones'
  loadComponent: () =>
    import('./pages/admin-quote-view/admin-quote-view').then((m) => m.AdminQuoteView),
  canActivate: [permissionGuard],
  data: { permission: 'cotizaciones:r' }
},
```

### Comportamiento
- Constructor + `private async init()`: lee `route.snapshot.params['id']`, llama `quoteService.getById(id)`, si tiene `contract_id` llama `contractService.getById(contract_id)`
- Signals: `quote = signal<Quote | null>(null)`, `contract = signal<Contract | null>(null)`, `loading = signal(true)`

### Barra de acciones (sticky top, sobre el componente)
- Botón ← Cotizaciones → `router.navigate(['/admin/cotizaciones'])`
- Si **sin contrato** (estado borrador/enviada):
  - Botón **Editar** → `router.navigate(['/admin/cotizaciones', id, 'editar'])`
  - Botón **Enviar** → reutilizar lógica de `openSendPanel` de `admin-quotes`
  - Botón **Imprimir** → reutilizar `printQuote()` de `admin-quotes`
- Si **con contrato**:
  - Botón **Ir al evento** → `router.navigate(['/admin/evento', contract.id])`
  - Botón **Imprimir** → `printQuote()`

### Cuerpo
```html
<app-quote-detail
  [quote]="quote()!"
  [contract]="contract()"
  [showActions]="false"
/>
```

---

## 3. Pestaña "Cotización" en `admin-event-detail`

### Cambio quirúrgico

Reemplazar el bloque actual de tarjetas (desde `<!-- Quote header -->` hasta `<!-- Amendment badge -->`, líneas ~948–1019 de `admin-event-detail.html`) con:

```html
<app-quote-detail
  [quote]="quote()!"
  [contract]="contract()!"
  [showActions]="false"
/>
```

El `QuoteDetailComponent` en este contexto recibirá el `contract` del evento y mostrará la sección de estado del contrato.

**Lo que NO cambia:**
- Badge de addendum pendiente (`@if (amendment() && ...)`) — queda debajo del componente
- Botón "Modificar Cotización" — queda debajo del componente
- Editor inline de addendum (`@if (amendmentEditing())`) — queda intacto
- Toda la lógica TypeScript de `amendment*` en `admin-event-detail.ts` — sin tocar
- Botones de envío del link de addendum — sin tocar

### Import a agregar en `admin-event-detail.ts`
```typescript
import { QuoteDetailComponent } from '../../../../shared/components/quote-detail/quote-detail';
// + añadir a imports[]
```

---

## 4. Líneas personalizadas en el Wizard (Step 4)

### Señales nuevas en `admin-quote-wizard.ts`
```typescript
readonly freeLines = signal<{ descripcion: string; cantidad: number; precio_unitario: number }[]>([]);

readonly freeLinesTotal = computed(() =>
  this.freeLines().reduce((s, l) => s + l.cantidad * l.precio_unitario, 0) * 100
);
```

`freeLinesTotal` en centavos, se suma a `subtotalCents()`.

### Método
```typescript
addFreeLine(): void {
  this.freeLines.update(l => [...l, { descripcion: '', cantidad: 1, precio_unitario: 0 }]);
}
removeFreeLine(index: number): void {
  this.freeLines.update(l => l.filter((_, i) => i !== index));
}
updateFreeLine(index: number, field: string, value: string | number): void {
  this.freeLines.update(l =>
    l.map((line, i) => i === index ? { ...line, [field]: field === 'descripcion' ? value : Number(value) } : line)
  );
}
```

### Cambio en `buildQuoteItems()`
```typescript
// Al final, antes del return:
for (const line of this.freeLines()) {
  if (line.descripcion.trim()) {
    items.push({ descripcion: line.descripcion, cantidad: line.cantidad, precio_unitario: line.precio_unitario });
  }
}
```

### Cambio en `populateFromQuote()` (modo edición)
Al cargar una cotización para editar, los ítems que no correspondan a package/snack/extras conocidos se cargan en `freeLines` (en lugar de ignorarse).

### UI en Step 4 (`admin-quote-wizard.html`)
Al final de la sección de extras, antes del total:
```html
<!-- Líneas personalizadas -->
<div class="mt-6">
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-sm font-semibold text-slate-700">Líneas personalizadas</h3>
    <button type="button" (click)="addFreeLine()" class="...">
      <i class="pi pi-plus text-xs"></i> Agregar línea
    </button>
  </div>
  @for (line of freeLines(); track $index; let i = $index) {
    <div class="flex gap-2 items-center mb-2">
      <input type="text" [value]="line.descripcion"
        (input)="updateFreeLine(i, 'descripcion', $any($event.target).value)"
        placeholder="Descripción" class="flex-1 ..." />
      <input type="number" [value]="line.cantidad"
        (input)="updateFreeLine(i, 'cantidad', $any($event.target).value)"
        min="1" class="w-16 ..." />
      <input type="number" [value]="line.precio_unitario"
        (input)="updateFreeLine(i, 'precio_unitario', $any($event.target).value)"
        min="0" class="w-28 ..." />
      <button type="button" (click)="removeFreeLine(i)" class="...">×</button>
    </div>
  }
</div>
```

---

## 5. Navegación desde la lista `/admin/cotizaciones`

En `admin-quotes.html`, hacer la fila de cada cotización clickeable que navegue a `/admin/cotizaciones/:id`.

En `admin-quotes.ts`, agregar:
```typescript
openView(quote: Quote): void {
  void this.router.navigate(['/admin/cotizaciones', quote.id]);
}
```

La fila completa (o un área definida de la misma) lleva el handler `(click)="openView(quote)"`. Los botones de acción existentes (anticipo, editar, etc.) mantienen `(click)="..."; $event.stopPropagation()` para no activar el row click.

---

## Archivos modificados / creados

| Acción | Archivo |
|---|---|
| CREATE | `src/app/shared/components/quote-detail/quote-detail.ts` |
| CREATE | `src/app/shared/components/quote-detail/quote-detail.html` |
| CREATE | `src/app/features/admin/pages/admin-quote-view/admin-quote-view.ts` |
| CREATE | `src/app/features/admin/pages/admin-quote-view/admin-quote-view.html` |
| MODIFY | `src/app/features/admin/admin.routes.ts` |
| MODIFY | `src/app/features/admin/pages/admin-quotes/admin-quotes.ts` |
| MODIFY | `src/app/features/admin/pages/admin-quotes/admin-quotes.html` |
| MODIFY | `src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts` |
| MODIFY | `src/app/features/admin/pages/admin-event-detail/admin-event-detail.html` |
| MODIFY | `src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.ts` |
| MODIFY | `src/app/features/admin/pages/admin-quote-wizard/admin-quote-wizard.html` |

---

## Restricciones técnicas globales

- Angular 20 zoneless — `provideZonelessChangeDetection()` — sin `NgZone`, sin `ChangeDetectorRef.detectChanges()`
- NO `standalone: true` en ningún `@Component` (default en Angular v20+)
- Constructor + `private async init()` — nunca `async ngOnInit()`
- `ChangeDetectionStrategy.OnPush` en todos los componentes
- Templates externos `.html` únicamente
- `inject()` para DI — sin constructor injection
- `@if`, `@for`, `@switch` — nunca `*ngIf`, `*ngFor`
- NO `ngClass`, NO `ngStyle` — solo bindings `[class.foo]` o `[class]`
- Montos en pesos — pipe `currency:'MXN':'symbol-narrow':'1.0-0'` sin parámetro de locale

---

## Criterios de aceptación

1. Clic en fila de `/admin/cotizaciones` navega a `/admin/cotizaciones/:id`
2. La página muestra cliente, fecha de evento, horario, conceptos agrupados, totales y estado del contrato
3. Botones contextuales: Editar si no hay contrato, Ir al evento si lo hay
4. La pestaña "Cotización" del evento embebe el mismo componente con la misma fidelidad visual
5. El flujo de addendum en el evento no se altera — badge, botón "Modificar" y editor inline funcionan igual
6. El wizard Step 4 tiene sección "Líneas personalizadas" funcional
7. Al editar una cotización con líneas libres, éstas se recuperan en los campos de freeLines
8. Build: cero errores TypeScript/Angular
