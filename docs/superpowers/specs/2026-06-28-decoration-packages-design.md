# Paquetes Decoración — Design Spec

## Goal

Extend the "Niveles de Decoración" model to support reference images, base prices, inclusions lists, and dimension notes; expose this catalog through a new backoffice tab in Admin Experiencias; and add a public "Paquetes Decoración" section to the landing page that mirrors the design of page 7 of the Hula Hoop PDF brochure.

## Business Rules (from PDF pages 3 & 7)

- Decoration levels (Petite, Grand, Plus) are a **venue-level catalog** — they are the same physical decoration designs regardless of which experience package the client books.
- Per-category upgrade pricing is **separate** from the level catalog:
  - Hula Hula → Petite included by default; Grand = +$1,400 upgrade; Plus = +$2,700 upgrade
  - Hooping → Grand included by default; Plus = +$1,300 upgrade
- The existing `package_category_configs.decorations` JSONB handles upgrade pricing and is **not changed** by this feature.
- The new `decoration_levels` table handles the visual catalog: what each level looks like, what it includes, what it costs as a standalone item, and its dimension specs.

## Architecture

### What changes

| Layer | Change |
|---|---|
| DB | New table `decoration_levels` |
| Storage | New bucket `decoration-packages` |
| Interfaces | New `DecorationLevel` interface |
| Services | New `DecorationLevelService` |
| Admin | New "Decoración" tab in `AdminExperiences` |
| Frontend | New `DecorationPackagesSection` home component |
| Home page | Insert `DecorationPackagesSection` between `PrivateEventsSection` and `PlayDaySection` |

### What does NOT change

- `package_category_configs` table and its `decorations` JSONB column
- `DecorationOption` interface (upgrade pricing model)
- `AdminExperiences` existing tabs (Hula Hula / Hooping)
- Quote wizard / reservation flow

---

## Data Model

### `decoration_levels` table

```sql
CREATE TABLE public.decoration_levels (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  image_url        TEXT,
  base_price_cents INTEGER NOT NULL DEFAULT 0,
  inclusions       TEXT[] NOT NULL DEFAULT '{}',
  notes            TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.decoration_levels ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Lectura pública de niveles de decoración"
  ON public.decoration_levels FOR SELECT USING (true);

-- Authenticated admin write
CREATE POLICY "Modificación de niveles de decoración por administradores"
  ON public.decoration_levels FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_users
      WHERE venue_users.user_id = auth.uid()
        AND venue_users.role IN ('owner', 'admin')
    )
  );
```

### TypeScript interface

```typescript
// src/app/core/interfaces/decoration-level.ts
export interface DecorationLevel {
  id: string;
  venue_id: string;
  name: string;
  image_url: string | null;
  base_price_cents: number;
  inclusions: string[];
  notes: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

---

## Storage

**Bucket:** `decoration-packages` (public read, authenticated write).

**Upload path:** `{venue_id}/{level_id}` — one file per level, overwritten on update.

**Public URL pattern:** `https://<project>.supabase.co/storage/v1/object/public/decoration-packages/{venue_id}/{level_id}`

---

## Service

**File:** `src/app/core/services/decoration-level.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class DecorationLevelService {
  getActiveByVenue(venueId: string): Promise<DecorationLevel[]>
  getAllByVenue(venueId: string): Promise<DecorationLevel[]>
  create(data: Omit<DecorationLevel, 'id' | 'created_at' | 'updated_at'>): Promise<DecorationLevel | null>
  update(id: string, changes: Partial<Omit<DecorationLevel, 'id' | 'venue_id' | 'created_at' | 'updated_at'>>): Promise<DecorationLevel | null>
  remove(id: string): Promise<boolean>
  uploadImage(file: File, venueId: string, levelId: string): Promise<string | null>
}
```

- `getActiveByVenue` filters `is_active = true`, ordered by `sort_order ASC`.
- `getAllByVenue` returns all records (used by admin, no filter).
- `uploadImage` uploads to `decoration-packages/{venueId}/{levelId}`, returns the public URL.
- On create: first `insert` to get the `id`, then call `uploadImage` if a file was provided, then `update` `image_url`.

---

## Backoffice — Admin Experiencias

### New "Decoración" tab

The `AdminExperiences` component gains a third tab alongside "Hula Hula" and "Hooping":

```
[ 🌸 Hula Hula ]  [ ✨ Hooping ]  [ 🎨 Decoración ]
```

When "Decoración" is active:
- Shows a `p-table` listing all decoration levels for the current venue (including inactive).
- Columns: Imagen (thumbnail 48×48), Nombre, Precio Base, # Inclusiones, Orden, Activo, Acciones.
- "Nuevo nivel" button → opens create dialog.
- Edit / delete buttons per row.

### Create / Edit Dialog (width: 36rem)

Fields in order:
1. **Nombre** — text input, required.
2. **Imagen de referencia** — `<input type="file" accept="image/*">` with live preview (object-cover, rounded-xl, max-h-48). Shows existing image_url if editing.
3. **Precio base (MXN)** — `p-inputNumber` in currency mode, required.
4. **Incluye** — same pattern as existing inclusions editor: text input + "Agregar" button → chips list with × to remove.
5. **Notas de medidas** — `<textarea>` for free text ("Ancho: 2.50 m · Altura: 2.00 m").
6. **Orden** — `p-inputNumber`.
7. **Activo** — `p-toggleSwitch`.

On save: if a new file was selected, upload it first to get `image_url`, then upsert the level record.

### State signals added to `AdminExperiences`

```typescript
readonly decorationLevels = signal<DecorationLevel[]>([]);
readonly decorationLevelsLoading = signal(false);
readonly showDecorationLevelDialog = signal(false);
readonly editingDecorationLevel = signal<DecorationLevel | null>(null);
// draft fields:
readonly decLevelName = signal('');
readonly decLevelPrice = signal(0);
readonly decLevelInclusions = signal<string[]>([]);
readonly decLevelNotes = signal('');
readonly decLevelSortOrder = signal(0);
readonly decLevelIsActive = signal(true);
readonly decLevelFile = signal<File | null>(null);
readonly decLevelPreviewUrl = signal<string | null>(null);
readonly decLevelSaving = signal(false);
```

### Tab switching

Add a third option to the tab selector:

```typescript
readonly activeTab = signal<'hula_hula' | 'hooping' | 'decoracion'>('hula_hula');
```

When `activeTab` is `'decoracion'`, load `decorationLevels` via `DecorationLevelService.getAllByVenue()`.

---

## Frontend — DecorationPackagesSection

**Files:**
- `src/app/features/home/components/decoration-packages-section/decoration-packages-section.ts`
- `src/app/features/home/components/decoration-packages-section/decoration-packages-section.html`

**Data:** Loaded in constructor via `DecorationLevelService.getActiveByVenue(venue.id)`, stored in a `levels = signal<DecorationLevel[]>([])` signal.

**Render guard:** The entire section is wrapped in `@if (levels().length > 0)` — if no active levels are configured, nothing renders.

### Layout

```
<section> background: #F5EDD8, with grid-bg pattern

  <h2 font-bubblegum> PAQUETES DECORACIÓN </h2>
  <p font-display> Todos nuestros paquetes de decoración son diseños personalizados y únicos. </p>

  @for (level of levels(); track level.id; let i = $index) {
    <!-- Card: alternates image left (even) / image right (odd) -->
    <article class="flex flex-col md:flex-row" [class.md:flex-row-reverse]="i % 2 !== 0">

      <!-- Image side (55% width on md+) -->
      <div class="relative">
        <img [src]="level.image_url" [alt]="level.name + ' decoración'" />
        <!-- Rotated name badge (vertical text, left/right depending on side) -->
        <span class="absolute ... font-bubblegum rotate-[-90deg]">{{ level.name }}</span>
        <!-- Dimension notes overlay at bottom of image -->
        @if (level.notes) {
          <p class="absolute bottom-0 ... font-display text-xs">{{ level.notes }}</p>
        }
      </div>

      <!-- Content side (45% width on md+) -->
      <div class="bg-white rounded-2xl border-4 border-[#6C63FF]">
        <p class="font-display font-bold uppercase">INCLUYE:</p>
        <ul>
          @for (item of level.inclusions; track item) {
            <li>+ {{ item }}</li>
          }
        </ul>
        <!-- Price badge -->
        <div class="bg-[#6C63FF] rounded-full font-bubblegum text-white">
          {{ level.base_price_cents | currencyMxn }}
        </div>
      </div>

    </article>
  }
</section>
```

### Colors and typography

| Element | Value |
|---|---|
| Section background | `#F5EDD8` (existing in project) |
| Card border / price badge background | `#6C63FF` (morado, existing palette) |
| Price text | white |
| Title | `font-bubblegum`, uppercase, dark color (matches other section titles) |
| Level name badge | `font-bubblegum`, white on morado, rotated `-90deg` |
| Inclusions list | `font-display`, size sm |
| Notes | `font-display`, size xs, italic |

---

## Home Page Integration

**File:** `src/app/features/home/pages/home-page/home-page.html`

Insert `<app-decoration-packages-section />` between `<app-private-events-section />` and `<app-play-day-section />`.

Add `DecorationPackagesSection` to `home-page.ts` imports array.

---

## Accessibility

- `<section>` has `aria-labelledby` pointing to the `<h2>` id.
- Each card is `<article>` with an implicit label from the level name.
- Image `alt` = `"{name} — paquete de decoración"`.
- Price badge has `aria-label="Precio: $X,XXX"`.
- File input in admin has `<label>` associated via `for`/`id`.

---

## Out of scope

- Seeding decoration levels with real data (done manually via admin after deploy).
- Connecting decoration levels to the quote wizard (upgrade pricing stays in JSONB).
- Multi-image galleries per level.
- Soft-delete / archive (only `is_active` toggle).
