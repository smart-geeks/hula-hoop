# Extras Category Headers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add category grouping (EXTRAS / HULA MUNCH BAR / SERVICIOS ADICIONALES) to the extras list in both the online quote builder and the backoffice quote wizard, with section title headers between groups.

**Architecture:** Add a `category` column to the `extras` table in Supabase (migration), propagate it through the TypeScript interface, expose a selector in the admin-extras CRUD, and use a `computed` signal in both quote builder components to group extras before rendering.

**Tech Stack:** Angular 20 (zoneless, signals), Supabase PostgreSQL, PrimeNG, Tailwind CSS.

## Global Constraints

- Angular v20+ — `standalone: true` is the default, never set it explicitly.
- Zoneless mode — no `NgZone`, no `async ngOnInit`. Use `constructor()` + private async method pattern.
- No `@HostBinding` / `@HostListener` — use `host` object in `@Component`.
- No `ngClass` / `ngStyle` — use `class` / `style` bindings.
- Currency pipes: never pass `'es-MX'` as 4th argument (locale is global).
- All component templates are external `.html` files — never inline templates.
- Change detection: always `ChangeDetectionStrategy.OnPush`.
- Native control flow: `@if`, `@for`, `@switch` — never `*ngIf` / `*ngFor`.
- The three valid category values are exactly: `'extras'`, `'hula_munch_bar'`, `'servicios_adicionales'`.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260628000003_add_category_to_extras.sql` | Create | DB migration: add `category` column with CHECK constraint and default |
| `src/app/core/interfaces/extra.ts` | Modify | Add `category` union type field to `Extra` interface |
| `src/app/features/admin/pages/admin-extras/admin-extras.ts` | Modify | Add `category` FormControl; include it in create/update payload |
| `src/app/features/admin/pages/admin-extras/admin-extras.html` | Modify | Add category `<select>` in dialog; show category badge in table |
| `src/app/features/reservations/pages/private-reservation-page/private-reservation-page.ts` | Modify | Add `extrasByCategory` computed signal grouping `extras()` by category |
| `src/app/features/reservations/pages/private-reservation-page/private-reservation-page.html` | Modify | Replace flat `@for` loop with grouped rendering using section headers |
| `src/app/features/admin/pages/admin-quotes/admin-quotes.ts` | Modify | Add `extrasByCategory` computed signal (same logic as above) |
| `src/app/features/admin/pages/admin-quotes/admin-quotes.html` | Modify | Replace flat `@for` loop in Step 4 with grouped rendering |

---

## Task 1: DB Migration + TypeScript Interface

**Files:**
- Create: `supabase/migrations/20260628000003_add_category_to_extras.sql`
- Modify: `src/app/core/interfaces/extra.ts`

**Interfaces:**
- Produces: `Extra.category: 'extras' | 'hula_munch_bar' | 'servicios_adicionales'` — used by all subsequent tasks.

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260628000003_add_category_to_extras.sql
ALTER TABLE extras
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'extras'
    CHECK (category IN ('extras', 'hula_munch_bar', 'servicios_adicionales'));
```

- [ ] **Step 2: Apply the migration**

```bash
cd /home/eduardo/Proyectos/hula-hoop
npx supabase db push
```

Expected: migration applies cleanly. Verify in Supabase dashboard that the `extras` table now has a `category` column with all existing rows defaulted to `'extras'`.

- [ ] **Step 3: Update the Extra interface**

Replace the entire content of `src/app/core/interfaces/extra.ts`:

```typescript
export type ExtraCategory = 'extras' | 'hula_munch_bar' | 'servicios_adicionales';

export interface ExtraVariant {
  id: string;
  name: string;
  price_cents: number;
}

export interface Extra {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  pay_at_venue: boolean;
  is_active: boolean;
  sort_order: number;
  category: ExtraCategory;
  variants?: ExtraVariant[] | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If `category` is used anywhere else in the codebase before Task 2, TypeScript will surface it here — fix any simple missing-property errors by adding `category: 'extras'` as a default.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260628000003_add_category_to_extras.sql \
        src/app/core/interfaces/extra.ts
git commit -m "feat(extras): add category column to DB and Extra interface"
```

---

## Task 2: Admin Extras — Category Selector in CRUD

**Files:**
- Modify: `src/app/features/admin/pages/admin-extras/admin-extras.ts:56-64` (form group)
- Modify: `src/app/features/admin/pages/admin-extras/admin-extras.html` (dialog + table)

**Interfaces:**
- Consumes: `ExtraCategory` from `src/app/core/interfaces/extra.ts`
- Produces: Extra records saved/updated with `category` field set from the form.

- [ ] **Step 1: Add `category` import and FormControl to admin-extras.ts**

In `src/app/features/admin/pages/admin-extras/admin-extras.ts`, add the `ExtraCategory` import alongside the existing `Extra` import:

```typescript
import type { Extra, ExtraCategory } from '../../../../core/interfaces/extra';
```

In the `form` group definition (around line 56), add `category` after `sort_order`:

```typescript
readonly form = this.fb.nonNullable.group({
  name: ['', Validators.required],
  description: [''],
  price_cents: [0, [Validators.required, Validators.min(0)]],
  pay_at_venue: [false],
  is_active: [true],
  sort_order: [0],
  category: ['extras' as ExtraCategory, Validators.required],
  variants: this.fb.array([]),
});
```

- [ ] **Step 2: Include `category` in openNew() reset**

Find `openNew()` (around line 102) and add `category: 'extras'` to the reset payload:

```typescript
openNew(): void {
  this.editingExtra.set(null);
  this.hasVariants.set(false);
  this.form.reset({ name: '', description: '', price_cents: 0, pay_at_venue: false, is_active: true, sort_order: 0, category: 'extras' });
  this.variantsFormArray.clear();
  this.dialogVisible.set(true);
}
```

- [ ] **Step 3: Include `category` in openEdit() patch**

Find `openEdit()` (around line 110) and add `category` to the `patchValue` call:

```typescript
this.form.patchValue({
  name: extra.name,
  description: extra.description ?? '',
  price_cents: hasVars ? 0 : extra.price_cents / 100,
  pay_at_venue: extra.pay_at_venue,
  is_active: extra.is_active,
  sort_order: extra.sort_order,
  category: extra.category ?? 'extras',
});
```

- [ ] **Step 4: Include `category` in the save() payload**

Find `save()` (around line 139). In the `values` object, add `category`:

```typescript
const values = {
  name: raw.name,
  description: raw.description || null,
  price_cents: priceCents,
  pay_at_venue: raw.pay_at_venue,
  is_active: raw.is_active,
  sort_order: raw.sort_order,
  category: raw.category as ExtraCategory,
  variants: variantsList,
};
```

- [ ] **Step 5: Add category selector to admin-extras.html dialog**

In `src/app/features/admin/pages/admin-extras/admin-extras.html`, add the following block **just before** the `<div class="grid grid-cols-2 gap-4">` that contains sort_order and is_active (around line 129):

```html
<!-- Category selector -->
<div>
  <label class="block text-sm font-semibold text-slate-700 mb-1.5" for="extra-category">Categoría</label>
  <select id="extra-category" formControlName="category"
    class="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rojo-brillante/30 appearance-none cursor-pointer">
    <option value="extras">Extras</option>
    <option value="hula_munch_bar">Hula Munch Bar</option>
    <option value="servicios_adicionales">Servicios Adicionales</option>
  </select>
</div>
```

- [ ] **Step 6: Show category in table**

In `admin-extras.html`, in the `<thead>` row, add a column header after "Nombre":

```html
<th>Categoría</th>
```

In the `<ng-template #body let-extra>`, add a `<td>` after the name cell:

```html
<td>
  @if (extra.category === 'hula_munch_bar') {
    <span class="text-xs font-semibold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Hula Munch Bar</span>
  } @else if (extra.category === 'servicios_adicionales') {
    <span class="text-xs font-semibold bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">Servicios Adicionales</span>
  } @else {
    <span class="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">Extras</span>
  }
</td>
```

Also update `colspan="5"` in the empty message `<td>` to `colspan="6"`.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Manual smoke test**

Start the dev server (`npm start`) and navigate to `/admin/extras`. Open "Nuevo extra" dialog — confirm the Categoría selector appears with 3 options. Create an extra with category "Hula Munch Bar", save, and verify the badge in the table row shows "Hula Munch Bar".

- [ ] **Step 9: Commit**

```bash
git add src/app/features/admin/pages/admin-extras/admin-extras.ts \
        src/app/features/admin/pages/admin-extras/admin-extras.html
git commit -m "feat(admin-extras): add category selector and badge in CRUD"
```

---

## Task 3: Online Quote Builder — Grouped Extras with Headers

**Files:**
- Modify: `src/app/features/reservations/pages/private-reservation-page/private-reservation-page.ts`
- Modify: `src/app/features/reservations/pages/private-reservation-page/private-reservation-page.html`

**Interfaces:**
- Consumes: `Extra.category` (Task 1), `extras` signal (already exists in component)
- Produces: `extrasByCategory` computed — `Array<{ category: ExtraCategory; label: string; items: Extra[] }>` — consumed by the template.

- [ ] **Step 1: Add `ExtraCategory` import to private-reservation-page.ts**

Add `ExtraCategory` to the existing extra import:

```typescript
import type { Extra, ExtraCategory } from '../../../../core/interfaces/extra';
```

- [ ] **Step 2: Add `EXTRA_CATEGORY_CONFIG` constant and `extrasByCategory` computed**

Add this constant and computed signal after the existing `readonly extras = signal<Extra[]>([])` line (around line 93):

```typescript
private static readonly EXTRA_CATEGORY_ORDER: ExtraCategory[] = [
  'extras',
  'hula_munch_bar',
  'servicios_adicionales',
];

private static readonly EXTRA_CATEGORY_LABELS: Record<ExtraCategory, string> = {
  extras: 'Extras',
  hula_munch_bar: 'Hula Munch Bar',
  servicios_adicionales: 'Servicios Adicionales',
};

readonly extrasByCategory = computed(() => {
  const allExtras = this.extras();
  return PrivateReservationPage.EXTRA_CATEGORY_ORDER
    .map(cat => ({
      category: cat,
      label: PrivateReservationPage.EXTRA_CATEGORY_LABELS[cat],
      items: allExtras.filter(e => e.category === cat),
    }))
    .filter(group => group.items.length > 0);
});
```

> **Note:** Replace `PrivateReservationPage` with the actual class name if it differs — check the `export class` declaration at the top of the file.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Update private-reservation-page.html — replace flat extras loop with grouped rendering**

Locate the "Regular Extras Section" block in the HTML (around line 446–502). Replace the entire `@if (extras().length === 0) ... @else { ... }` block with:

```html
@if (extrasByCategory().length === 0) {
  <p class="text-slate-500 bg-slate-50 rounded-xl p-4">No hay extras disponibles.</p>
} @else {
  <div class="flex flex-col gap-6">
    @for (group of extrasByCategory(); track group.category) {
      <div>
        <!-- Category header -->
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xs font-bold uppercase tracking-widest text-slate-400">{{ group.label }}</span>
          <div class="flex-1 h-px bg-slate-100"></div>
        </div>
        <!-- Extras in this category -->
        <div class="flex flex-col gap-3">
          @for (extra of group.items; track extra.id) {
            <div class="p-4 rounded-xl border transition-colors"
                 [class]="getExtraQuantity(extra) > 0
                   ? 'border-[#F2A7D8]/40 bg-[#F2A7D8]/5'
                   : 'border-slate-200 bg-white'">
               <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div class="flex-1 cursor-pointer" (click)="toggleExtra(extra)">
                  <h3 class="font-semibold text-slate-800 text-sm">{{ extra.name }}</h3>
                  @if (extra.description) {
                    <p class="text-xs text-slate-500 mt-0.5 leading-relaxed">{{ extra.description }}</p>
                  }
                  @if (extra.variants && extra.variants.length > 0) {
                    <div class="mt-2" (click)="$event.stopPropagation()">
                      <select
                        [ngModel]="getExtraVariantId(extra)"
                        (ngModelChange)="updateExtraVariant(extra, $event)"
                        class="w-full sm:w-64 text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium text-slate-700 outline-none focus:border-[#F2A7D8] focus:ring-1 focus:ring-[#F2A7D8]">
                        @for (v of extra.variants; track v.id) {
                          <option [value]="v.id">{{ v.name }} ({{ v.price_cents | currencyMxn }})</option>
                        }
                      </select>
                    </div>
                  } @else {
                    @if (extra.pay_at_venue) {
                      <p class="text-xs font-semibold text-indigo-600 mt-1">Se cobra en el local</p>
                    } @else {
                      <p class="text-xs font-semibold text-[#F2A7D8] mt-1">{{ extra.price_cents | currencyMxn }} c/u</p>
                    }
                  }
                </div>
                @if (getExtraQuantity(extra) > 0) {
                  <p-inputNumber
                    [ngModel]="getExtraQuantity(extra)"
                    (ngModelChange)="updateExtraQuantity(extra, $event)"
                    [min]="1"
                    [max]="50"
                    [showButtons]="true"
                    class="w-full sm:w-24 shrink-0 [&_input]:w-full" />
                } @else {
                  <p-button icon="pi pi-plus" [rounded]="true" [outlined]="true"
                            severity="secondary" (onClick)="toggleExtra(extra)" />
                }
              </div>
            </div>
          }
        </div>
      </div>
    }
  </div>
}
```

- [ ] **Step 5: Manual smoke test**

Navigate to `/torreon/reservar/fiesta-privada`, proceed to Step 4 (Glam Girls y Extras). Verify that extras appear grouped under their category headers. If some extras have `category = 'extras'` (the default) and none under other categories, only the "Extras" header should appear.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/reservations/pages/private-reservation-page/private-reservation-page.ts \
        src/app/features/reservations/pages/private-reservation-page/private-reservation-page.html
git commit -m "feat(reservation): group extras by category with section headers"
```

---

## Task 4: Backoffice Quote Wizard — Grouped Extras with Headers

**Files:**
- Modify: `src/app/features/admin/pages/admin-quotes/admin-quotes.ts`
- Modify: `src/app/features/admin/pages/admin-quotes/admin-quotes.html`

**Interfaces:**
- Consumes: `Extra.category` (Task 1), `extras` signal (already exists at line ~97 of admin-quotes.ts), `getExtraQty(extraId)` and `setExtraQty(extraId, delta)` methods, `getExtraVariantId(extraId)` and `setExtraVariantId(extraId, variantId)` methods.
- Produces: `extrasByCategory` computed — same shape as Task 3.

- [ ] **Step 1: Add `ExtraCategory` import to admin-quotes.ts**

Add `ExtraCategory` to the existing Extra import line (around line 26):

```typescript
import type { Extra, ExtraCategory } from '../../../../core/interfaces/extra';
```

- [ ] **Step 2: Add `EXTRA_CATEGORY_ORDER`, `EXTRA_CATEGORY_LABELS`, and `extrasByCategory` to admin-quotes.ts**

Locate the `readonly extras = signal<Extra[]>([])` declaration (around line 97). Add after it:

```typescript
private static readonly EXTRA_CATEGORY_ORDER: ExtraCategory[] = [
  'extras',
  'hula_munch_bar',
  'servicios_adicionales',
];

private static readonly EXTRA_CATEGORY_LABELS: Record<ExtraCategory, string> = {
  extras: 'Extras',
  hula_munch_bar: 'Hula Munch Bar',
  servicios_adicionales: 'Servicios Adicionales',
};

readonly extrasByCategory = computed(() => {
  const allExtras = this.extras();
  return AdminQuotes.EXTRA_CATEGORY_ORDER
    .map(cat => ({
      category: cat,
      label: AdminQuotes.EXTRA_CATEGORY_LABELS[cat],
      items: allExtras.filter(e => e.category === cat),
    }))
    .filter(group => group.items.length > 0);
});
```

> **Note:** Replace `AdminQuotes` with the actual class name declared in the file's `export class` line.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Update admin-quotes.html Step 4 — replace flat extras loop with grouped rendering**

Locate the "Extras catalog" block inside Step 4 (around line 748–789 of admin-quotes.html):

```html
<!-- Extras catalog -->
<div>
  <label class="block text-sm font-semibold text-slate-700 mb-3">Extras Adicionales</label>
  <div class="grid grid-cols-1 gap-2">
    @for (extra of extras(); track extra.id) {
      ...
    }
  </div>
</div>
```

Replace this entire block with:

```html
<!-- Extras catalog — grouped by category -->
<div>
  <label class="block text-sm font-semibold text-slate-700 mb-3">Extras Adicionales</label>
  @if (extrasByCategory().length === 0) {
    <p class="text-sm text-slate-400 text-center py-4">No hay extras disponibles.</p>
  } @else {
    <div class="flex flex-col gap-5">
      @for (group of extrasByCategory(); track group.category) {
        <div>
          <!-- Category header -->
          <div class="flex items-center gap-2 mb-2">
            <span class="text-[10px] font-bold uppercase tracking-widest text-slate-400">{{ group.label }}</span>
            <div class="flex-1 h-px bg-slate-100"></div>
          </div>
          <!-- Extras in this category -->
          <div class="grid grid-cols-1 gap-2">
            @for (extra of group.items; track extra.id) {
              <div class="flex items-center justify-between p-3.5 border border-slate-200 bg-white rounded-xl">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-slate-800 truncate">{{ extra.name }}</p>
                  @if (extra.description) {
                    <p class="text-[10px] text-slate-400 mt-0.5 truncate">{{ extra.description }}</p>
                  }
                  @if (extra.variants && extra.variants.length > 0) {
                    <div class="mt-2 max-w-xs">
                      <select
                        [ngModel]="getExtraVariantId(extra.id)"
                        (ngModelChange)="setExtraVariantId(extra.id, $event)"
                        class="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400">
                        @for (v of extra.variants; track v.id) {
                          <option [value]="v.id">{{ v.name }} ({{ v.price_cents | currencyMxn }})</option>
                        }
                      </select>
                    </div>
                  } @else {
                    <div class="flex items-center gap-2 mt-1">
                      <span class="text-xs font-bold text-slate-600">{{ extra.price_cents | currencyMxn }}</span>
                      @if (extra.pay_at_venue) {
                        <span class="text-[9px] font-semibold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">Cobro en sitio</span>
                      }
                    </div>
                  }
                </div>
                <div class="flex items-center gap-2 shrink-0 ml-4">
                  <button type="button" (click)="setExtraQty(extra.id, -1)"
                    class="w-8 h-8 rounded border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 font-bold transition-colors">−</button>
                  <span class="w-6 text-center font-bold text-slate-800 text-sm">{{ getExtraQty(extra.id) }}</span>
                  <button type="button" (click)="setExtraQty(extra.id, 1)"
                    class="w-8 h-8 rounded border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 font-bold transition-colors">+</button>
                </div>
              </div>
            }
          </div>
        </div>
      }
    </div>
  }
</div>
```

- [ ] **Step 5: Manual smoke test**

In the admin, navigate to Cotizaciones → "Nueva cotización". Go to Step 4 (Extras). Verify extras appear grouped under their section headers. Confirm quantity +/− buttons still work, variant selectors still work.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/admin/pages/admin-quotes/admin-quotes.ts \
        src/app/features/admin/pages/admin-quotes/admin-quotes.html
git commit -m "feat(admin-quotes): group extras by category with section headers in wizard"
```

---

## Final Verification

After all 4 tasks:

1. Go to `/admin/extras` → verify existing extras show "Extras" badge, you can edit them to assign a new category.
2. Assign a few extras to "Hula Munch Bar" and "Servicios Adicionales" via the admin.
3. Open the online quote at `/torreon/reservar/fiesta-privada`, reach Step 4 → verify the 3 category groups appear with headers.
4. Open `/admin/cotizaciones` → Nueva cotización → Step 4 → verify same grouping.
5. Run `npx tsc --noEmit` one final time — 0 errors.
