# Event Detail Milestone Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la barra de progreso 1→2→3→4 de la página de detalle de evento por 4 cards de hitos (Contrato, Pagos, Tareas, Gastos) que muestran el estado real del evento de un vistazo y son clickeables para activar el tab correspondiente.

**Architecture:** Se agrega una migración de BD para las 3 columnas de documentos faltantes, se añaden computed signals al componente TypeScript, y se reemplaza el bloque HTML de la progress bar por 4 cards en grid. Los tabs y su contenido no cambian.

**Tech Stack:** Angular 20 Zoneless + Signals, Tailwind CSS, Supabase PostgreSQL, PrimeIcons

---

## Mapa de archivos

| Archivo | Acción |
|---------|--------|
| `supabase/migrations/20260615000001_add_contract_document_columns.sql` | Crear — agrega 3 columnas a `contracts` |
| `src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts` | Modificar — quitar lifecycle steps, agregar computed + scrollToTab |
| `src/app/features/admin/pages/admin-event-detail/admin-event-detail.html` | Modificar — quitar progress bar, agregar 4 cards, agregar id="tabs-section" |

---

## Task 1: Migración de base de datos

**Files:**
- Create: `supabase/migrations/20260615000001_add_contract_document_columns.sql`

- [ ] **Step 1.1: Crear el archivo de migración**

Crear el archivo con este contenido exacto:

```sql
-- Add document columns to contracts table that are declared in TypeScript
-- but missing from the database schema.
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS firma_url        TEXT,
  ADD COLUMN IF NOT EXISTS ine_url          TEXT,
  ADD COLUMN IF NOT EXISTS comprobante_url  TEXT;
```

- [ ] **Step 1.2: Aplicar la migración a la base de datos remota**

```bash
cd /home/eduardo/Proyectos/hula-hoop
npx supabase db push
```

Resultado esperado: línea confirmando que la migración `20260615000001_add_contract_document_columns` fue aplicada.

- [ ] **Step 1.3: Verificar que las columnas existen**

```bash
npx supabase db diff
```

Resultado esperado: sin diferencias pendientes (diff vacío).

- [ ] **Step 1.4: Commit de la migración**

```bash
git add supabase/migrations/20260615000001_add_contract_document_columns.sql
git commit -m "feat: add firma_url, ine_url, comprobante_url columns to contracts table"
```

---

## Task 2: Actualizar el componente TypeScript

**Files:**
- Modify: `src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts`

**Contexto:** El archivo actual tiene `LIFECYCLE_STEPS` (array), `currentStep` (computed) y `stepProgressWidth()` (método) que alimentan la barra de progreso que vamos a eliminar. Están en las líneas ~405-440. Se eliminan y se agregan los nuevos computed + método.

- [ ] **Step 2.1: Eliminar los miembros relacionados con lifecycle steps**

En `src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts`, eliminar estos tres bloques exactos:

```typescript
  stepProgressWidth(): string {
    const pct = (this.currentStep() - 1) / (this.LIFECYCLE_STEPS.length - 1) * 100;
    return `calc(${pct}% - (${pct / 100} * 2.5rem))`;
  }
```

```typescript
  // Lifecycle configuration
  readonly LIFECYCLE_STEPS = [
    { step: 1, label: 'Cotizado',   status: 'cotizado' },
    { step: 2, label: 'Contratado', status: 'firmado' },
    { step: 3, label: 'Liquidado',  status: 'liquidado' },
    { step: 4, label: 'Concluido',  status: 'concluido' },
  ];

  readonly currentStep = computed(() => {
    const status = this.contract()?.estado ?? 'borrador';
    if (status === 'cancelado') return 0;
    if (status === 'borrador') return 1;
    if (status === 'firmado') return 2;
    if (status === 'liquidado') return 3;
    if (status === 'concluido') return 4;
    return 1;
  });
```

- [ ] **Step 2.2: Agregar los nuevos computed signals y el método scrollToTab**

Justo antes del método `private sortTasks(...)`, agregar estos bloques:

```typescript
  // ── Milestone card state ──────────────────────────────
  readonly documentosCompletos = computed(() => {
    const c = this.contract();
    if (!c) return false;
    const tieneFirma = !!(c.firma_url || c.pdf_url);
    return !!(c.ine_url && c.comprobante_url && tieneFirma);
  });

  readonly tareasStatus = computed((): 'completo' | 'pendiente' | 'sin-tareas' => {
    const total = this.tasks().length;
    if (total === 0) return 'sin-tareas';
    return this.completedTaskCount() === total ? 'completo' : 'pendiente';
  });

  scrollToTab(tab: DetailTab): void {
    this.setTab(tab);
    setTimeout(() => {
      document.getElementById('tabs-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }
```

- [ ] **Step 2.3: Verificar que el proyecto compila sin errores**

```bash
cd /home/eduardo/Proyectos/hula-hoop
npx ng build --configuration=development 2>&1 | tail -20
```

Resultado esperado: `Build at:` con `0 errors`. Si hay errores de referencia a `LIFECYCLE_STEPS`, `currentStep` o `stepProgressWidth` es porque quedaron referencias en el HTML — se resolverán en el Task 3.

---

## Task 3: Actualizar el template HTML

**Files:**
- Modify: `src/app/features/admin/pages/admin-event-detail/admin-event-detail.html`

- [ ] **Step 3.1: Eliminar el bloque de la progress bar**

Localizar y eliminar el bloque completo (desde el comentario hasta el cierre del div exterior):

```html
  <!-- ── PROGRESS BAR ─────────────────────────────── -->
  <div class="bg-white border border-slate-200 rounded-2xl px-6 py-5 shadow-sm">
    <div class="flex items-center justify-between relative">
      <!-- Background track -->
      <div class="absolute left-0 right-0 top-[18px] h-0.5 bg-slate-200 mx-5" aria-hidden="true"></div>
      <!-- Filled track -->
      <div class="absolute left-5 top-[18px] h-0.5 bg-emerald-400 transition-all duration-500"
        [style.width]="stepProgressWidth()"
        aria-hidden="true"></div>

      @for (step of LIFECYCLE_STEPS; track step.step) {
        <div class="flex flex-col items-center relative z-10">
          <!-- Circle: completed = green check, active = red/brand, future = grey -->
          @if (currentStep() > step.step) {
            <div class="w-9 h-9 rounded-full bg-emerald-500 text-white ring-2 ring-white flex items-center justify-center text-sm font-bold transition-all duration-300"
              [attr.aria-label]="step.label + ' (completado)'">
              <i class="pi pi-check text-xs"></i>
            </div>
          } @else if (currentStep() === step.step) {
            <div class="w-9 h-9 rounded-full ring-2 ring-white flex items-center justify-center text-sm font-bold transition-all duration-300 text-white"
              [class]="isLocked() ? 'bg-slate-500' : 'bg-rojo-brillante'"
              [attr.aria-label]="step.label + ' (actual)'">
              {{ step.step }}
            </div>
          } @else {
            <div class="w-9 h-9 rounded-full bg-slate-200 text-slate-400 ring-2 ring-white flex items-center justify-center text-sm font-bold transition-all duration-300"
              [attr.aria-label]="step.label + ' (pendiente)'">
              {{ step.step }}
            </div>
          }
          <!-- Label: always visible on sm+, only active on mobile -->
          <span class="mt-2 text-[11px] font-medium text-center leading-tight max-w-[60px]"
            [class]="currentStep() === step.step ? 'text-slate-700 font-semibold' : (currentStep() > step.step ? 'text-emerald-600 hidden sm:block' : 'text-slate-400 hidden sm:block')">
            {{ step.label }}
          </span>
        </div>
      }
    </div>
  </div>
```

- [ ] **Step 3.2: Insertar las 4 cards de hitos en el mismo lugar**

En el espacio donde estaba la progress bar (entre el cierre del header y el lock banner), insertar:

```html
  <!-- ── MILESTONE CARDS ────────────────────────────── -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">

    <!-- CONTRATO -->
    <button (click)="scrollToTab('contrato')"
      [class]="'text-left bg-white border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all '
        + (documentosCompletos() ? 'border-emerald-200' : 'border-amber-200')">
      <div class="flex items-start justify-between mb-3">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <i class="pi pi-file-edit text-blue-500 text-sm"></i>
          </div>
          <span class="font-semibold text-slate-700 text-sm">Contrato</span>
        </div>
        @if (documentosCompletos()) {
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">✓ Completo</span>
        } @else {
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">⚠ Pendiente</span>
        }
      </div>
      <div class="space-y-1.5 text-xs">
        <div class="flex items-center justify-between">
          <span class="text-slate-400">INE</span>
          @if (contract()?.ine_url) {
            <span class="text-emerald-600 font-medium">✓ subido</span>
          } @else {
            <span class="text-slate-300">✗ falta</span>
          }
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-400">Comprobante</span>
          @if (contract()?.comprobante_url) {
            <span class="text-emerald-600 font-medium">✓ subido</span>
          } @else {
            <span class="text-slate-300">✗ falta</span>
          }
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-400">Firma</span>
          @if (contract()?.firma_url || contract()?.pdf_url) {
            <span class="text-emerald-600 font-medium">✓ firmado</span>
          } @else {
            <span class="text-slate-300">✗ pendiente</span>
          }
        </div>
      </div>
    </button>

    <!-- PAGOS -->
    <button (click)="scrollToTab('pagos')"
      [class]="'text-left bg-white border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all '
        + (saldoPendiente() === 0 ? 'border-emerald-200' : 'border-amber-200')">
      <div class="flex items-start justify-between mb-3">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <i class="pi pi-credit-card text-emerald-500 text-sm"></i>
          </div>
          <span class="font-semibold text-slate-700 text-sm">Pagos</span>
        </div>
        @if (saldoPendiente() === 0) {
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">✓ Liquidado</span>
        } @else {
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">{{ pagoProgress() }}% pagado</span>
        }
      </div>
      <div class="space-y-1.5 text-xs">
        <div class="flex justify-between">
          <span class="text-slate-400">Total</span>
          <span class="font-semibold text-slate-700">{{ contract()?.total_contrato | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Pagado</span>
          <span class="font-semibold text-emerald-600">{{ contract()?.deposito_pagado | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Saldo</span>
          <span [class]="saldoPendiente() > 0 ? 'font-bold text-amber-600' : 'font-semibold text-emerald-600'">
            {{ saldoPendiente() > 0 ? (saldoPendiente() | currency:'MXN':'symbol-narrow':'1.0-0') : '—' }}
          </span>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-1.5 mt-1">
          <div class="h-1.5 rounded-full transition-all duration-500"
            [class]="pagoProgress() >= 100 ? 'bg-emerald-400' : 'bg-amber-400'"
            [style.width.%]="pagoProgress()"></div>
        </div>
      </div>
    </button>

    <!-- TAREAS -->
    <button (click)="scrollToTab('tareas')"
      [class]="'text-left bg-white border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all '
        + (tareasStatus() === 'completo' ? 'border-emerald-200' : tareasStatus() === 'pendiente' ? 'border-amber-200' : 'border-slate-200')">
      <div class="flex items-start justify-between mb-3">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
            <i class="pi pi-check-square text-violet-500 text-sm"></i>
          </div>
          <span class="font-semibold text-slate-700 text-sm">Tareas</span>
        </div>
        @if (tareasStatus() === 'sin-tareas') {
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 shrink-0">Sin tareas</span>
        } @else if (tareasStatus() === 'completo') {
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">✓ Completas</span>
        } @else {
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">{{ tasks().length - completedTaskCount() }} pendientes</span>
        }
      </div>
      <div class="space-y-1.5 text-xs">
        @if (tasks().length === 0) {
          <p class="text-slate-400 leading-relaxed">Sin actividades configuradas aún</p>
        } @else {
          <div class="flex justify-between">
            <span class="text-slate-400">Completadas</span>
            <span class="font-semibold text-slate-700">{{ completedTaskCount() }} / {{ tasks().length }}</span>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-1.5 mt-1">
            <div class="h-1.5 rounded-full transition-all duration-500"
              [class]="taskProgress() >= 100 ? 'bg-emerald-400' : 'bg-violet-400'"
              [style.width.%]="taskProgress()"></div>
          </div>
          <p class="text-slate-400">{{ taskProgress() }}% completado</p>
        }
      </div>
    </button>

    <!-- GASTOS -->
    <button (click)="scrollToTab('gastos')"
      [class]="'text-left bg-white border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all '
        + (totalExpenses() > 0 ? 'border-slate-200' : 'border-amber-200')">
      <div class="flex items-start justify-between mb-3">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
            <i class="pi pi-wallet text-orange-500 text-sm"></i>
          </div>
          <span class="font-semibold text-slate-700 text-sm">Gastos</span>
        </div>
        @if (totalExpenses() > 0) {
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">{{ expenses().length }} registros</span>
        } @else {
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">⚠ Recordar</span>
        }
      </div>
      <div class="space-y-1.5 text-xs">
        @if (totalExpenses() > 0) {
          <div class="flex justify-between">
            <span class="text-slate-400">Total acumulado</span>
            <span class="font-bold text-slate-800">{{ totalExpenses() | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Registros</span>
            <span class="font-semibold text-slate-600">{{ expenses().length }}</span>
          </div>
        } @else {
          <p class="text-amber-700 leading-relaxed">¿Recuerdas registrar los gastos del evento?</p>
        }
      </div>
    </button>

  </div>
```

- [ ] **Step 3.3: Agregar `id="tabs-section"` al contenedor de los tabs**

Localizar esta línea en el HTML:

```html
  <div class="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
```

Reemplazar por:

```html
  <div id="tabs-section" class="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
```

- [ ] **Step 3.4: Verificar que el build compila sin errores**

```bash
cd /home/eduardo/Proyectos/hula-hoop
npx ng build --configuration=development 2>&1 | tail -20
```

Resultado esperado: `Build at:` con `0 errors`.

- [ ] **Step 3.5: Commit del componente**

```bash
git add src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts
git add src/app/features/admin/pages/admin-event-detail/admin-event-detail.html
git commit -m "feat: replace lifecycle progress bar with milestone cards in event detail"
```

---

## Task 4: Smoke test manual

- [ ] **Step 4.1: Levantar el dev server**

```bash
cd /home/eduardo/Proyectos/hula-hoop
npm run dev
```

- [ ] **Step 4.2: Abrir un evento en el navegador**

Navegar a `http://localhost:4200/admin/evento/e8215989-2144-4f9d-be1a-d1dfdbb6d493` (o cualquier evento con datos).

Verificar visualmente:
- [ ] Las 4 cards aparecen donde estaba la progress bar (ya no existe la barra 1-2-3-4)
- [ ] Card Contrato muestra verde/ámbar según documentos presentes (`ine_url`, `comprobante_url`, `firma_url`/`pdf_url`)
- [ ] Card Pagos muestra el total, pagado y saldo con la mini barra
- [ ] Card Tareas muestra X/Y o "Sin actividades" si no hay tareas
- [ ] Card Gastos muestra total si hay gastos, o el mensaje de recordatorio si es $0
- [ ] Click en cualquier card activa el tab correcto y hace scroll hasta él
- [ ] En pantalla estrecha (DevTools mobile) las cards se ven en grid 2×2

- [ ] **Step 4.3: Probar con un evento sin documentos**

Verificar que las cards de Contrato y Gastos muestran el estado ámbar con los textos correctos cuando no hay datos.
