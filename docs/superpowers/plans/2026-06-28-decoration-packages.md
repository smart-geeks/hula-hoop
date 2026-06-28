# Paquetes Decoración — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a venue-level decoration levels catalog (DB + storage), manage it from Admin Experiencias, and display it as a new "Paquetes Decoración" section on the landing page.

**Architecture:** New `decoration_levels` table stores the visual catalog (image, name, base price, inclusions, dimension notes) independently of `package_category_configs.decorations` JSONB which continues to hold per-category upgrade pricing untouched. A `DecorationLevelService` reads/writes the table and handles image uploads to a `decoration-packages` Supabase Storage bucket. `AdminExperiences` gains a third "Decoración" tab. A new `DecorationPackagesSection` component is inserted in the home page between `PrivateEventsSection` and `PlayDaySection`.

**Tech Stack:** Angular 20 (zoneless, standalone, signals, OnPush), Supabase (PostgreSQL + Storage MCP), PrimeNG, Tailwind CSS.

## Global Constraints

- **Angular 20 zoneless:** NO `NgZone`, NO `async ngOnInit`. Load data in constructor via `private async loadXxx()` pattern.
- **No `standalone: true`** in component decorators (it's the default in Angular v20+).
- **ChangeDetection:** always `ChangeDetectionStrategy.OnPush`.
- **External templates only** — never inline templates in `.ts` files.
- **Signals for all state:** `signal()`, `computed()`, `effect()`. NO mutations via `mutate()`.
- **`inject()` function**, never constructor injection parameters.
- **Native control flow:** `@if`, `@for`, `@switch` — never `*ngIf`, `*ngFor`, `*ngSwitch`.
- **Currency pipe:** `currencyMxn` (custom pipe at `src/app/core/pipes/currency-mxn.pipe.ts`) — no raw locale params.
- **Signal binding patterns in templates** (critical — follow existing HTML patterns exactly):
  - Text inputs: `[value]="sig()" (input)="sig.set($any($event.target).value)"`
  - PrimeNG number inputs: `[ngModel]="sig()" (ngModelChange)="sig.set($event || 0)"`
  - PrimeNG toggleSwitch: `[ngModel]="sig()" (ngModelChange)="sig.set(!!$event)"`
  - PrimeNG dialog visibility: `[visible]="sig()" (visibleChange)="sig.set($event)"`
  - PrimeNG component width: use `styleClass="w-full"` not `class="w-full"`
- **Supabase project ID:** `jzdfxbbnhkzdetrpmqdx`
- **Torreón venue ID:** `00000000-0000-0000-0000-000000000001`
- **All prices stored as integer cents** (e.g. $3,200 MXN = 320000 cents).
- **Image upload path:** `{venue_id}/{level_id}.{ext}` in bucket `decoration-packages`.
- **WCAG AA:** every icon-only `p-button` needs `pTooltip` + `aria-label`; every `p-dialog` needs `aria-label`; `<img>` needs meaningful `alt`.
- **Section colors:** background `#F5EDD8`, accent/border/badge `#6C63FF`.
- **Fonts:** `font-bubblegum` for section title and level name badge; `font-display` for inclusions list and notes.

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/20260628000004_decoration_levels.sql` | CREATE |
| `src/app/core/interfaces/decoration-level.ts` | CREATE |
| `src/app/core/services/decoration-level.service.ts` | CREATE |
| `src/app/features/admin/pages/admin-experiences/admin-experiences.ts` | MODIFY |
| `src/app/features/admin/pages/admin-experiences/admin-experiences.html` | MODIFY |
| `src/app/features/home/components/decoration-packages-section/decoration-packages-section.ts` | CREATE |
| `src/app/features/home/components/decoration-packages-section/decoration-packages-section.html` | CREATE |
| `src/app/features/home/pages/home-page/home-page.ts` | MODIFY |
| `src/app/features/home/pages/home-page/home-page.html` | MODIFY |

---

### Task 1: DB Migration + Storage Bucket

**Files:**
- Create: `supabase/migrations/20260628000004_decoration_levels.sql`

**Interfaces:**
- Produces: `decoration_levels` table in Supabase with RLS; `decoration-packages` storage bucket with public read.

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/20260628000004_decoration_levels.sql`:

```sql
-- Decoration levels: venue-level catalog of decoration tiers (Petite, Grand, Plus)
-- Independent from package_category_configs.decorations (which holds upgrade pricing per category)
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

ALTER TABLE public.decoration_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de niveles de decoración"
  ON public.decoration_levels FOR SELECT USING (true);

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

- [ ] **Step 2: Apply migration via Supabase MCP**

Use the `mcp__claude_ai_Supabase__apply_migration` tool:
- `project_id`: `jzdfxbbnhkzdetrpmqdx`
- `name`: `decoration_levels`
- `query`: (the SQL above)

Expected: response with no error, migration appears in `supabase/migrations` list.

- [ ] **Step 3: Create the storage bucket**

Use the Supabase MCP `mcp__claude_ai_Supabase__execute_sql` to create the bucket programmatically, OR use the Supabase Dashboard:

Dashboard path: Storage → New Bucket
- Name: `decoration-packages`
- Public: ✅ (public read)
- File size limit: 5 MB
- Allowed MIME types: `image/jpeg, image/png, image/webp`

Verify: the bucket appears in Storage → Buckets.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260628000004_decoration_levels.sql
git commit -m "feat: add decoration_levels table and RLS policies"
```

---

### Task 2: Interface + Service

**Files:**
- Create: `src/app/core/interfaces/decoration-level.ts`
- Create: `src/app/core/services/decoration-level.service.ts`

**Interfaces:**
- Consumes: `SupabaseService` at `src/app/core/services/supabase.service.ts` (existing singleton, has `.client` property)
- Produces:
  - `DecorationLevel` interface — consumed by Tasks 3 and 4
  - `DecorationLevelService` with these exact method signatures:
    - `getActiveByVenue(venueId: string): Promise<DecorationLevel[]>`
    - `getAllByVenue(venueId: string): Promise<DecorationLevel[]>`
    - `create(data: Omit<DecorationLevel, 'id' | 'created_at' | 'updated_at'>): Promise<DecorationLevel | null>`
    - `update(id: string, changes: Partial<Omit<DecorationLevel, 'id' | 'venue_id' | 'created_at' | 'updated_at'>>): Promise<DecorationLevel | null>`
    - `remove(id: string): Promise<boolean>`
    - `uploadImage(file: File, venueId: string, levelId: string): Promise<string | null>`

- [ ] **Step 1: Create the interface**

Create `src/app/core/interfaces/decoration-level.ts`:

```typescript
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

- [ ] **Step 2: Create the service**

Create `src/app/core/services/decoration-level.service.ts`:

```typescript
import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { DecorationLevel } from '../interfaces/decoration-level';

@Injectable({ providedIn: 'root' })
export class DecorationLevelService {
  private readonly supabase = inject(SupabaseService);

  async getActiveByVenue(venueId: string): Promise<DecorationLevel[]> {
    const client = this.supabase.client;
    if (!client) return [];
    const { data, error } = await client
      .from('decoration_levels')
      .select('*')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) { console.error('Error fetching decoration levels:', error.message); return []; }
    return data as DecorationLevel[];
  }

  async getAllByVenue(venueId: string): Promise<DecorationLevel[]> {
    const client = this.supabase.client;
    if (!client) return [];
    const { data, error } = await client
      .from('decoration_levels')
      .select('*')
      .eq('venue_id', venueId)
      .order('sort_order', { ascending: true });
    if (error) { console.error('Error fetching all decoration levels:', error.message); return []; }
    return data as DecorationLevel[];
  }

  async create(data: Omit<DecorationLevel, 'id' | 'created_at' | 'updated_at'>): Promise<DecorationLevel | null> {
    const client = this.supabase.client;
    if (!client) return null;
    const { data: result, error } = await client
      .from('decoration_levels')
      .insert(data)
      .select()
      .single();
    if (error) { console.error('Error creating decoration level:', error.message); return null; }
    return result as DecorationLevel;
  }

  async update(id: string, changes: Partial<Omit<DecorationLevel, 'id' | 'venue_id' | 'created_at' | 'updated_at'>>): Promise<DecorationLevel | null> {
    const client = this.supabase.client;
    if (!client) return null;
    const { data, error } = await client
      .from('decoration_levels')
      .update(changes)
      .eq('id', id)
      .select()
      .single();
    if (error) { console.error('Error updating decoration level:', error.message); return null; }
    return data as DecorationLevel;
  }

  async remove(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;
    const { error } = await client
      .from('decoration_levels')
      .delete()
      .eq('id', id);
    if (error) { console.error('Error deleting decoration level:', error.message); return false; }
    return true;
  }

  async uploadImage(file: File, venueId: string, levelId: string): Promise<string | null> {
    const client = this.supabase.client;
    if (!client) return null;
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${venueId}/${levelId}.${ext}`;
    const { error } = await client.storage
      .from('decoration-packages')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) { console.error('Error uploading decoration image:', error.message); return null; }
    const { data } = client.storage.from('decoration-packages').getPublicUrl(path);
    return data.publicUrl;
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors referencing the new files.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/interfaces/decoration-level.ts \
        src/app/core/services/decoration-level.service.ts
git commit -m "feat: add DecorationLevel interface and service with image upload"
```

---

### Task 3: Admin Backoffice — Decoración Tab

**Files:**
- Modify: `src/app/features/admin/pages/admin-experiences/admin-experiences.ts`
- Modify: `src/app/features/admin/pages/admin-experiences/admin-experiences.html`

**Interfaces:**
- Consumes:
  - `DecorationLevel` from `src/app/core/interfaces/decoration-level.ts` (Task 2)
  - `DecorationLevelService` from `src/app/core/services/decoration-level.service.ts` (Task 2)
  - `PackageCategoryConfigService`, `VenueService`, `CurrencyMxnPipe` — all already imported in the existing file
- Produces: Fully functional Decoración CRUD tab within `/admin/experiencias`.

**Context — existing code to preserve:**
- The current component has a `selectedCategoryToEdit = signal<'hula_hula' | 'hooping'>('hula_hula')` and `categoryEditOptions` array used in a `p-select` dropdown. These will be replaced by a tri-tab button group (`activeTab` signal, type `'hula_hula' | 'hooping' | 'decoracion'`).
- All existing methods (`saveCategoryConfig`, `addCategoryInclusion`, `removeCategoryInclusion`, `openAddActivity`, `saveActivity`, `removeActivity`, `openAddDecoration`, `saveDecoration`, `removeDecoration`, `updateGlamGirlsPrice`, `updateGlamGirlsMinCount`) must be preserved unchanged.
- `activeCategoryConfig` computed uses `this.activeTab()` — returns `null` when activeTab is `'decoracion'`, which is fine because the template guards with `@if (activeTab() === 'hula_hula' || activeTab() === 'hooping')`.
- The existing HTML uses `ConfirmDialogModule` is NOT imported yet. Add `ConfirmDialogModule` and `ConfirmationService` for delete confirmation on decoration levels.

- [ ] **Step 1: Replace the TypeScript file**

Replace the entire content of `src/app/features/admin/pages/admin-experiences/admin-experiences.ts`:

```typescript
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { PackageCategoryConfigService } from '../../../../core/services/package-category-config.service';
import { DecorationLevelService } from '../../../../core/services/decoration-level.service';
import { VenueService } from '../../../../core/services/venue.service';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import type { PackageCategoryConfig, DecorationOption, ActivityOption } from '../../../../core/interfaces/package-category-config';
import type { DecorationLevel } from '../../../../core/interfaces/decoration-level';

type ActiveTab = 'hula_hula' | 'hooping' | 'decoracion';

@Component({
  selector: 'app-admin-experiences',
  templateUrl: './admin-experiences.html',
  imports: [
    FormsModule,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TextareaModule,
    ToggleSwitchModule,
    TableModule,
    TagModule,
    DialogModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
    CurrencyMxnPipe,
  ],
  providers: [MessageService, ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminExperiences {
  private readonly categoryConfigService = inject(PackageCategoryConfigService);
  private readonly decorationLevelService = inject(DecorationLevelService);
  private readonly venueService = inject(VenueService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  // ── Tab state ──────────────────────────────────────────────────────────────
  readonly activeTab = signal<ActiveTab>('hula_hula');

  readonly tabOptions: { label: string; value: ActiveTab }[] = [
    { label: '🌸 Hula Hula', value: 'hula_hula' },
    { label: '✨ Hooping',   value: 'hooping'   },
    { label: '🎨 Decoración', value: 'decoracion' },
  ];

  // ── Category configs (Hula Hula / Hooping) ────────────────────────────────
  readonly categoryConfigs = signal<PackageCategoryConfig[]>([]);
  readonly categoryConfigsLoading = signal(false);
  readonly categoryConfigsSaving = signal(false);

  readonly activeCategoryConfig = computed(() =>
    this.categoryConfigs().find(c => c.category === this.activeTab()) ?? null
  );

  readonly newInclusion = signal('');

  // Activities dialog
  readonly showActivityDialog = signal(false);
  readonly editingActivity = signal<ActivityOption | null>(null);
  readonly actName = signal('');
  readonly actGroup = signal<'A' | 'B' | 'C'>('A');
  readonly actPrice = signal(0);

  // Decoration upgrade dialog (per-category)
  readonly showDecorationDialog = signal(false);
  readonly editingDecoration = signal<DecorationOption | null>(null);
  readonly decName = signal('');
  readonly decPrice = signal(0);
  readonly decIsDefault = signal(false);

  // ── Decoration levels (catalog tab) ───────────────────────────────────────
  readonly decorationLevels = signal<DecorationLevel[]>([]);
  readonly decorationLevelsLoading = signal(false);
  readonly showDecorationLevelDialog = signal(false);
  readonly editingDecorationLevel = signal<DecorationLevel | null>(null);

  readonly decLevelName = signal('');
  readonly decLevelPrice = signal(0);
  readonly decLevelInclusions = signal<string[]>([]);
  readonly decLevelNewInclusion = signal('');
  readonly decLevelNotes = signal('');
  readonly decLevelSortOrder = signal(0);
  readonly decLevelIsActive = signal(true);
  readonly decLevelFile = signal<File | null>(null);
  readonly decLevelPreviewUrl = signal<string | null>(null);
  readonly decLevelSaving = signal(false);

  constructor() {
    effect(() => {
      const venueId = this.venueService.currentVenueId();
      if (venueId) {
        this.loadCategoryConfigs();
        this.loadDecorationLevels();
      }
    });
  }

  // ── Category config methods (unchanged from original) ─────────────────────

  private async loadCategoryConfigs(): Promise<void> {
    const venueId = this.venueService.currentVenueId();
    if (!venueId) return;
    this.categoryConfigsLoading.set(true);
    const data = await this.categoryConfigService.getConfigsByVenue(venueId);
    this.categoryConfigs.set(data);
    this.categoryConfigsLoading.set(false);
  }

  async saveCategoryConfig(config: PackageCategoryConfig): Promise<void> {
    this.categoryConfigsSaving.set(true);
    const result = await this.categoryConfigService.updateConfig(config.id, {
      inclusions: config.inclusions,
      decorations: config.decorations,
      activities: config.activities,
      glam_girls_price_cents: config.glam_girls_price_cents,
      glam_girls_min_count: config.glam_girls_min_count,
    });
    this.categoryConfigsSaving.set(false);
    if (result) {
      this.categoryConfigs.update(list => list.map(c => c.id === result.id ? result : c));
      this.messageService.add({ severity: 'success', summary: 'Configuración de experiencia guardada' });
    } else {
      this.messageService.add({ severity: 'error', summary: 'Error al guardar configuración de experiencia' });
    }
  }

  addCategoryInclusion(config: PackageCategoryConfig): void {
    const text = this.newInclusion().trim();
    if (!text) return;
    if (!config.inclusions.includes(text)) {
      const updated = { ...config, inclusions: [...config.inclusions, text] };
      this.categoryConfigs.update(list => list.map(c => c.id === config.id ? updated : c));
    }
    this.newInclusion.set('');
  }

  removeCategoryInclusion(config: PackageCategoryConfig, index: number): void {
    const inclusions = [...config.inclusions];
    inclusions.splice(index, 1);
    this.categoryConfigs.update(list => list.map(c => c.id === config.id ? { ...config, inclusions } : c));
  }

  openAddActivity(): void {
    this.editingActivity.set(null);
    this.actName.set(''); this.actGroup.set('A'); this.actPrice.set(0);
    this.showActivityDialog.set(true);
  }

  openEditActivity(act: ActivityOption): void {
    this.editingActivity.set(act);
    this.actName.set(act.name); this.actGroup.set(act.group); this.actPrice.set(act.price_per_person);
    this.showActivityDialog.set(true);
  }

  saveActivity(config: PackageCategoryConfig): void {
    const name = this.actName().trim();
    if (!name) return;
    const editing = this.editingActivity();
    let activities = [...config.activities];
    if (editing) {
      activities = activities.map(a => a.id === editing.id
        ? { ...a, name, group: this.actGroup(), price_per_person: this.actPrice() } : a);
    } else {
      activities.push({ id: `act_${Date.now()}`, group: this.actGroup(), name, price_per_person: this.actPrice() });
    }
    this.categoryConfigs.update(list => list.map(c => c.id === config.id ? { ...config, activities } : c));
    this.showActivityDialog.set(false);
  }

  removeActivity(config: PackageCategoryConfig, actId: string): void {
    const activities = config.activities.filter(a => a.id !== actId);
    this.categoryConfigs.update(list => list.map(c => c.id === config.id ? { ...config, activities } : c));
  }

  openAddDecoration(): void {
    this.editingDecoration.set(null);
    this.decName.set(''); this.decPrice.set(0); this.decIsDefault.set(false);
    this.showDecorationDialog.set(true);
  }

  openEditDecoration(dec: DecorationOption): void {
    this.editingDecoration.set(dec);
    this.decName.set(dec.name);
    this.decPrice.set(dec.price_cents / 100);
    this.decIsDefault.set(dec.is_default);
    this.showDecorationDialog.set(true);
  }

  saveDecoration(config: PackageCategoryConfig): void {
    const name = this.decName().trim();
    if (!name) return;
    const editing = this.editingDecoration();
    let decorations = [...config.decorations];
    const isDefault = this.decIsDefault();
    if (isDefault) decorations = decorations.map(d => ({ ...d, is_default: false }));
    if (editing) {
      decorations = decorations.map(d => d.id === editing.id
        ? { ...d, name, price_cents: Math.round(this.decPrice() * 100), is_default: isDefault } : d);
    } else {
      decorations.push({ id: `dec_${Date.now()}`, name, price_cents: Math.round(this.decPrice() * 100), is_default: isDefault });
    }
    this.categoryConfigs.update(list => list.map(c => c.id === config.id ? { ...config, decorations } : c));
    this.showDecorationDialog.set(false);
  }

  removeDecoration(config: PackageCategoryConfig, decId: string): void {
    const decorations = config.decorations.filter(d => d.id !== decId);
    this.categoryConfigs.update(list => list.map(c => c.id === config.id ? { ...config, decorations } : c));
  }

  updateGlamGirlsPrice(config: PackageCategoryConfig, pricePesos: number): void {
    this.categoryConfigs.update(list =>
      list.map(c => c.id === config.id ? { ...config, glam_girls_price_cents: Math.round(pricePesos * 100) } : c));
  }

  updateGlamGirlsMinCount(config: PackageCategoryConfig, minCount: number): void {
    this.categoryConfigs.update(list =>
      list.map(c => c.id === config.id ? { ...config, glam_girls_min_count: minCount } : c));
  }

  // ── Decoration levels methods ──────────────────────────────────────────────

  private async loadDecorationLevels(): Promise<void> {
    const venueId = this.venueService.currentVenueId();
    if (!venueId) return;
    this.decorationLevelsLoading.set(true);
    const data = await this.decorationLevelService.getAllByVenue(venueId);
    this.decorationLevels.set(data);
    this.decorationLevelsLoading.set(false);
  }

  openNewDecorationLevel(): void {
    this.editingDecorationLevel.set(null);
    this.decLevelName.set('');
    this.decLevelPrice.set(0);
    this.decLevelInclusions.set([]);
    this.decLevelNewInclusion.set('');
    this.decLevelNotes.set('');
    this.decLevelSortOrder.set(0);
    this.decLevelIsActive.set(true);
    this.decLevelFile.set(null);
    this.decLevelPreviewUrl.set(null);
    this.showDecorationLevelDialog.set(true);
  }

  openEditDecorationLevel(level: DecorationLevel): void {
    this.editingDecorationLevel.set(level);
    this.decLevelName.set(level.name);
    this.decLevelPrice.set(level.base_price_cents / 100);
    this.decLevelInclusions.set([...level.inclusions]);
    this.decLevelNewInclusion.set('');
    this.decLevelNotes.set(level.notes ?? '');
    this.decLevelSortOrder.set(level.sort_order);
    this.decLevelIsActive.set(level.is_active);
    this.decLevelFile.set(null);
    this.decLevelPreviewUrl.set(level.image_url);
    this.showDecorationLevelDialog.set(true);
  }

  onDecorationLevelFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.decLevelFile.set(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => this.decLevelPreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  addDecorationLevelInclusion(): void {
    const text = this.decLevelNewInclusion().trim();
    if (!text) return;
    this.decLevelInclusions.update(list => list.includes(text) ? list : [...list, text]);
    this.decLevelNewInclusion.set('');
  }

  removeDecorationLevelInclusion(index: number): void {
    this.decLevelInclusions.update(list => list.filter((_, i) => i !== index));
  }

  async saveDecorationLevel(): Promise<void> {
    const venueId = this.venueService.currentVenueId();
    if (!venueId) return;
    const name = this.decLevelName().trim();
    if (!name) return;

    this.decLevelSaving.set(true);

    const payload = {
      venue_id: venueId,
      name,
      image_url: null as string | null,
      base_price_cents: Math.round(this.decLevelPrice() * 100),
      inclusions: this.decLevelInclusions(),
      notes: this.decLevelNotes().trim() || null,
      sort_order: this.decLevelSortOrder(),
      is_active: this.decLevelIsActive(),
    };

    const editing = this.editingDecorationLevel();

    if (editing) {
      let imageUrl = editing.image_url;
      const file = this.decLevelFile();
      if (file) {
        imageUrl = await this.decorationLevelService.uploadImage(file, venueId, editing.id);
      }
      const result = await this.decorationLevelService.update(editing.id, { ...payload, image_url: imageUrl });
      if (result) {
        this.decorationLevels.update(list => list.map(l => l.id === result.id ? result : l));
        this.messageService.add({ severity: 'success', summary: 'Nivel de decoración actualizado' });
        this.showDecorationLevelDialog.set(false);
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error al actualizar nivel' });
      }
    } else {
      // Insert first to get the id, then upload image using that id as filename
      const created = await this.decorationLevelService.create({ ...payload, image_url: null });
      if (created) {
        const file = this.decLevelFile();
        let finalLevel = created;
        if (file) {
          const imageUrl = await this.decorationLevelService.uploadImage(file, venueId, created.id);
          if (imageUrl) {
            const updated = await this.decorationLevelService.update(created.id, { image_url: imageUrl });
            finalLevel = updated ?? { ...created, image_url: imageUrl };
          }
        }
        this.decorationLevels.update(list => [...list, finalLevel]);
        this.messageService.add({ severity: 'success', summary: 'Nivel de decoración creado' });
        this.showDecorationLevelDialog.set(false);
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error al crear nivel' });
      }
    }

    this.decLevelSaving.set(false);
  }

  confirmDeleteDecorationLevel(level: DecorationLevel): void {
    this.confirmationService.confirm({
      message: `¿Eliminar el nivel "${level.name}"? Esta acción no se puede deshacer.`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-trash',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        const ok = await this.decorationLevelService.remove(level.id);
        if (ok) {
          this.decorationLevels.update(list => list.filter(l => l.id !== level.id));
          this.messageService.add({ severity: 'success', summary: 'Nivel eliminado' });
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error al eliminar nivel' });
        }
      },
    });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 3: Replace the HTML template**

Replace the entire content of `src/app/features/admin/pages/admin-experiences/admin-experiences.html`.

Key patterns to follow (from existing template):
- Text inputs: `[value]="sig()" (input)="sig.set($any($event.target).value)"`
- PrimeNG number: `[ngModel]="sig()" (ngModelChange)="sig.set($event || 0)"`
- Dialog: `[visible]="sig()" (visibleChange)="sig.set($event)"`

Full template:

```html
<p-toast />
<p-confirmDialog />

<h1 class="text-2xl font-bold font-display mb-6">Parámetros de Experiencias</h1>

<!-- Tab buttons -->
<div class="flex gap-2 mb-6 flex-wrap">
  @for (tab of tabOptions; track tab.value) {
    <button
      (click)="activeTab.set(tab.value)"
      class="px-5 py-2.5 rounded-full font-semibold text-sm transition-all duration-200 border-2"
      [class.bg-morado]="activeTab() === tab.value"
      [class.text-white]="activeTab() === tab.value"
      [class.border-morado]="activeTab() === tab.value"
      [class.bg-white]="activeTab() !== tab.value"
      [class.text-slate-600]="activeTab() !== tab.value"
      [class.border-slate-200]="activeTab() !== tab.value">
      {{ tab.label }}
    </button>
  }
</div>

<!-- ══════════════════════════════════════ HULA HULA / HOOPING TAB ══════════ -->
@if (activeTab() === 'hula_hula' || activeTab() === 'hooping') {
  @if (categoryConfigsLoading()) {
    <p class="text-neutro-500 animate-pulse">Cargando parámetros de experiencias...</p>
  } @else if (activeCategoryConfig(); as config) {
    <div class="flex flex-col gap-6 animate-fade-in pb-12">

      <div class="flex justify-end">
        <p-button label="Guardar Cambios" icon="pi pi-check" (onClick)="saveCategoryConfig(config)" [loading]="categoryConfigsSaving()" />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <!-- Glam Girls -->
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
          <h3 class="font-bold text-slate-800 flex items-center gap-2">
            <i class="pi pi-sparkles text-pink-500"></i>
            Glam Girls
          </h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Precio animadora extra</label>
              <p-inputNumber [ngModel]="config.glam_girls_price_cents / 100"
                             (ngModelChange)="updateGlamGirlsPrice(config, $event || 0)"
                             [min]="0" mode="currency" currency="MXN" locale="es-MX" styleClass="w-full" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Mínimo de animadoras</label>
              <p-inputNumber [ngModel]="config.glam_girls_min_count"
                             (ngModelChange)="updateGlamGirlsMinCount(config, $event || 0)"
                             [min]="0" [showButtons]="true" styleClass="w-full" />
            </div>
          </div>
        </div>

        <!-- Inclusiones -->
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
          <h3 class="font-bold text-slate-800 flex items-center gap-2">
            <i class="pi pi-list text-blue-500"></i>
            Inclusiones por defecto
          </h3>
          <div class="flex gap-2">
            <input pInputText [value]="newInclusion()" (input)="newInclusion.set($any($event.target).value)"
                   (keydown.enter)="$event.preventDefault(); addCategoryInclusion(config)"
                   placeholder="Ej: Pintacaritas" class="flex-1" />
            <p-button icon="pi pi-plus" (onClick)="addCategoryInclusion(config)" [outlined]="true"
                      aria-label="Agregar inclusión" pTooltip="Agregar" />
          </div>
          <div class="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
            @for (inc of config.inclusions; track inc; let i = $index) {
              <p-tag [value]="inc" severity="info" [rounded]="true">
                <button type="button" class="ml-1.5 cursor-pointer text-xs" (click)="removeCategoryInclusion(config, i)"
                        [attr.aria-label]="'Quitar ' + inc">✕</button>
              </p-tag>
            } @empty {
              <span class="text-sm text-slate-400 italic">No hay inclusiones configuradas.</span>
            }
          </div>
        </div>

        <!-- Upgrades de decoración (per-category pricing) -->
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4 lg:col-span-2">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold text-slate-800 flex items-center gap-2">
                <i class="pi pi-palette text-purple-500"></i>
                Upgrades de Decoración
              </h3>
              <p class="text-xs text-slate-500 mt-0.5">Precios de upgrade desde el nivel incluido en este paquete.</p>
            </div>
            <p-button label="Agregar nivel" icon="pi pi-plus" size="small" [outlined]="true" (onClick)="openAddDecoration()" />
          </div>
          <p-table [value]="config.decorations" styleClass="p-datatable-sm">
            <ng-template #header>
              <tr>
                <th>Nivel</th>
                <th>Precio extra (MXN)</th>
                <th>Por defecto</th>
                <th style="width: 6rem">Acciones</th>
              </tr>
            </ng-template>
            <ng-template #body let-dec>
              <tr>
                <td><span class="font-semibold text-slate-700">{{ dec.name }}</span></td>
                <td>{{ dec.price_cents | currencyMxn }}</td>
                <td>
                  @if (dec.is_default) {
                    <p-tag value="Incluido" severity="success" [rounded]="true" />
                  } @else {
                    <span class="text-slate-400 text-xs">No</span>
                  }
                </td>
                <td>
                  <div class="flex gap-1">
                    <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info"
                              (onClick)="openEditDecoration(dec)" pTooltip="Editar" aria-label="Editar nivel" />
                    <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger"
                              (onClick)="removeDecoration(config, dec.id)" pTooltip="Eliminar" aria-label="Eliminar nivel" />
                  </div>
                </td>
              </tr>
            </ng-template>
            <ng-template #emptymessage>
              <tr><td colspan="4" class="text-center py-4 text-slate-400 italic">No hay niveles configurados.</td></tr>
            </ng-template>
          </p-table>
        </div>

        <!-- Actividades -->
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4 lg:col-span-2">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-slate-800 flex items-center gap-2">
              <i class="pi pi-check-square text-green-500"></i>
              Catálogo de Actividades
            </h3>
            <p-button label="Agregar actividad" icon="pi pi-plus" size="small" [outlined]="true" (onClick)="openAddActivity()" />
          </div>
          <p-table [value]="config.activities" styleClass="p-datatable-sm">
            <ng-template #header>
              <tr>
                <th>Grupo</th>
                <th>Actividad</th>
                <th>Precio extra por niño (MXN)</th>
                <th style="width: 6rem">Acciones</th>
              </tr>
            </ng-template>
            <ng-template #body let-act>
              <tr>
                <td><p-tag [value]="'Grupo ' + act.group" [severity]="act.group === 'A' ? 'success' : (act.group === 'B' ? 'info' : 'warn')" /></td>
                <td><span class="font-semibold text-slate-700">{{ act.name }}</span></td>
                <td>{{ act.price_per_person | currencyMxn }}</td>
                <td>
                  <div class="flex gap-1">
                    <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info"
                              (onClick)="openEditActivity(act)" pTooltip="Editar" aria-label="Editar actividad" />
                    <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger"
                              (onClick)="removeActivity(config, act.id)" pTooltip="Eliminar" aria-label="Eliminar actividad" />
                  </div>
                </td>
              </tr>
            </ng-template>
            <ng-template #emptymessage>
              <tr><td colspan="4" class="text-center py-4 text-slate-400 italic">No hay actividades configuradas.</td></tr>
            </ng-template>
          </p-table>
        </div>

      </div>
    </div>
  } @else {
    <div class="flex flex-col items-center justify-center py-12 bg-white rounded-2xl border border-slate-200">
      <i class="pi pi-exclamation-triangle text-3xl text-amber-500 mb-3"></i>
      <p class="text-slate-600 font-semibold">No se encontró configuración para esta categoría en este local.</p>
    </div>
  }
}

<!-- ═══════════════════════════════════════════════ DECORACIÓN TAB ══════════ -->
@if (activeTab() === 'decoracion') {
  <div class="flex items-center justify-between mb-4 animate-fade-in">
    <div>
      <h2 class="font-bold text-slate-800 text-lg">Niveles de Decoración</h2>
      <p class="text-xs text-slate-500 mt-0.5">Catálogo visual de niveles disponibles para esta sede (Petite, Grand, Plus).</p>
    </div>
    <p-button label="Nuevo nivel" icon="pi pi-plus" (onClick)="openNewDecorationLevel()" />
  </div>

  <p-table [value]="decorationLevels()" [loading]="decorationLevelsLoading()" [rowHover]="true" breakpoint="768px">
    <ng-template #header>
      <tr>
        <th style="width:4.5rem">Imagen</th>
        <th>Nombre</th>
        <th>Precio base</th>
        <th>Ítems</th>
        <th>Orden</th>
        <th>Estado</th>
        <th style="width:7rem">Acciones</th>
      </tr>
    </ng-template>
    <ng-template #body let-level>
      <tr>
        <td>
          @if (level.image_url) {
            <img [src]="level.image_url" [alt]="level.name"
                 class="w-12 h-12 object-cover rounded-lg border border-slate-200" />
          } @else {
            <div class="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center">
              <i class="pi pi-image text-slate-400" aria-hidden="true"></i>
            </div>
          }
        </td>
        <td><span class="font-semibold text-slate-800">{{ level.name }}</span></td>
        <td><span class="font-semibold">{{ level.base_price_cents | currencyMxn }}</span></td>
        <td><span class="text-sm text-slate-600">{{ level.inclusions.length }}</span></td>
        <td>{{ level.sort_order }}</td>
        <td>
          <p-tag [value]="level.is_active ? 'Activo' : 'Inactivo'"
                 [severity]="level.is_active ? 'success' : 'warn'" />
        </td>
        <td>
          <div class="flex gap-1">
            <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info"
                      (onClick)="openEditDecorationLevel(level)" pTooltip="Editar" aria-label="Editar nivel de decoración" />
            <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger"
                      (onClick)="confirmDeleteDecorationLevel(level)" pTooltip="Eliminar" aria-label="Eliminar nivel de decoración" />
          </div>
        </td>
      </tr>
    </ng-template>
    <ng-template #emptymessage>
      <tr>
        <td colspan="7" class="text-center py-10 text-slate-400 italic">
          No hay niveles de decoración configurados. Haz clic en "Nuevo nivel" para agregar el primero.
        </td>
      </tr>
    </ng-template>
  </p-table>
}

<!-- ══════════════════════ DIALOG: upgrade decoración (per-category) ═════════ -->
<p-dialog [header]="editingDecoration() ? 'Editar decoración' : 'Nueva decoración'"
          [visible]="showDecorationDialog()" (visibleChange)="showDecorationDialog.set($event)"
          [modal]="true" [style]="{ width: '25rem' }" [closable]="true" [draggable]="false"
          aria-label="Editar opción de decoración">
  <div class="flex flex-col gap-4 pt-2">
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
      <input pInputText [value]="decName()" (input)="decName.set($any($event.target).value)"
             class="w-full font-sans text-sm" placeholder="Ej. Básica Petite" />
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-1.5">Precio de upgrade (MXN)</label>
      <p-inputNumber [ngModel]="decPrice()" (ngModelChange)="decPrice.set($event || 0)"
                     [min]="0" mode="currency" currency="MXN" locale="es-MX" styleClass="w-full text-sm" />
    </div>
    <div class="flex items-center gap-2">
      <p-toggleSwitch [ngModel]="decIsDefault()" (ngModelChange)="decIsDefault.set(!!$event)" />
      <label class="text-sm">Diseño por defecto</label>
    </div>
    <div class="flex justify-end gap-2 pt-2">
      <p-button label="Cancelar" severity="secondary" [outlined]="true" (onClick)="showDecorationDialog.set(false)" />
      @if (activeCategoryConfig(); as config) {
        <p-button label="Aceptar" (onClick)="saveDecoration(config)" />
      }
    </div>
  </div>
</p-dialog>

<!-- ══════════════════════════════════ DIALOG: actividad ═════════════════════ -->
<p-dialog [header]="editingActivity() ? 'Editar actividad' : 'Nueva actividad'"
          [visible]="showActivityDialog()" (visibleChange)="showActivityDialog.set($event)"
          [modal]="true" [style]="{ width: '25rem' }" [closable]="true" [draggable]="false"
          aria-label="Editar actividad">
  <div class="flex flex-col gap-4 pt-2">
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
      <input pInputText [value]="actName()" (input)="actName.set($any($event.target).value)"
             class="w-full font-sans text-sm" placeholder="Ej. Taller de Slime" />
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-1.5">Grupo *</label>
      <div class="flex gap-4">
        @for (g of ['A', 'B', 'C']; track g) {
          <label class="flex items-center gap-1.5 cursor-pointer text-sm">
            <input type="radio" name="actGroup" [value]="g" [checked]="actGroup() === g"
                   (change)="actGroup.set($any(g))" />
            <span>Grupo {{ g }}</span>
          </label>
        }
      </div>
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-1.5">Precio extra por niño (MXN)</label>
      <p-inputNumber [ngModel]="actPrice()" (ngModelChange)="actPrice.set($event || 0)"
                     [min]="0" mode="currency" currency="MXN" locale="es-MX" styleClass="w-full text-sm" />
    </div>
    <div class="flex justify-end gap-2 pt-2">
      <p-button label="Cancelar" severity="secondary" [outlined]="true" (onClick)="showActivityDialog.set(false)" />
      @if (activeCategoryConfig(); as config) {
        <p-button label="Aceptar" (onClick)="saveActivity(config)" />
      }
    </div>
  </div>
</p-dialog>

<!-- ════════════════════ DIALOG: nivel de decoración (catálogo) ══════════════ -->
<p-dialog [header]="editingDecorationLevel() ? 'Editar nivel de decoración' : 'Nuevo nivel de decoración'"
          [visible]="showDecorationLevelDialog()" (visibleChange)="showDecorationLevelDialog.set($event)"
          [modal]="true" [style]="{ width: '36rem' }" [closable]="true" [draggable]="false"
          aria-label="Editar nivel de decoración">
  <div class="flex flex-col gap-5 pt-2">

    <!-- Nombre -->
    <div>
      <label class="block text-sm font-semibold text-slate-700 mb-1.5" for="dl-name">Nombre *</label>
      <input pInputText id="dl-name"
             [value]="decLevelName()" (input)="decLevelName.set($any($event.target).value)"
             class="w-full" placeholder="Ej. Petite, Grand, Plus" />
    </div>

    <!-- Imagen de referencia -->
    <div>
      <label class="block text-sm font-semibold text-slate-700 mb-2" for="dl-image">Imagen de referencia</label>
      @if (decLevelPreviewUrl()) {
        <img [src]="decLevelPreviewUrl()!" alt="Vista previa del nivel"
             class="w-full max-h-48 object-cover rounded-xl border border-slate-200 mb-2" />
      }
      <input id="dl-image" type="file" accept="image/jpeg,image/png,image/webp"
             (change)="onDecorationLevelFileChange($event)"
             class="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer" />
    </div>

    <!-- Precio base -->
    <div>
      <label class="block text-sm font-semibold text-slate-700 mb-1.5" for="dl-price">Precio base (MXN) *</label>
      <p-inputNumber id="dl-price"
                     [ngModel]="decLevelPrice()" (ngModelChange)="decLevelPrice.set($event || 0)"
                     [min]="0" mode="currency" currency="MXN" locale="es-MX" styleClass="w-full" />
    </div>

    <!-- Incluye -->
    <div>
      <label class="block text-sm font-semibold text-slate-700 mb-2">Incluye</label>
      <div class="flex flex-col gap-1.5 mb-2 max-h-36 overflow-y-auto">
        @for (item of decLevelInclusions(); track item; let i = $index) {
          <div class="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg">
            <span class="flex-1 text-sm text-slate-700">{{ item }}</span>
            <p-button icon="pi pi-times" [rounded]="true" [text]="true" severity="danger" size="small"
                      (onClick)="removeDecorationLevelInclusion(i)" type="button"
                      [attr.aria-label]="'Quitar ' + item" pTooltip="Quitar" />
          </div>
        }
        @if (decLevelInclusions().length === 0) {
          <p class="text-xs text-slate-400 italic py-2 text-center">Sin ítems. Agrega al menos uno.</p>
        }
      </div>
      <div class="flex gap-2">
        <input pInputText
               [value]="decLevelNewInclusion()" (input)="decLevelNewInclusion.set($any($event.target).value)"
               (keydown.enter)="$event.preventDefault(); addDecorationLevelInclusion()"
               placeholder="Ej. 1 mampara grupo A" class="flex-1 text-sm" />
        <p-button label="Agregar" icon="pi pi-plus" size="small" [outlined]="true"
                  (onClick)="addDecorationLevelInclusion()" type="button" />
      </div>
    </div>

    <!-- Notas de medidas -->
    <div>
      <label class="block text-sm font-semibold text-slate-700 mb-1.5" for="dl-notes">Notas de medidas</label>
      <textarea pTextarea id="dl-notes" [rows]="2"
                [value]="decLevelNotes()" (input)="decLevelNotes.set($any($event.target).value)"
                class="w-full text-sm" placeholder="Ej. Ancho: 2.50 m · Altura: 2.00 m"></textarea>
    </div>

    <!-- Orden y activo -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-semibold text-slate-700 mb-1.5" for="dl-order">Orden</label>
        <p-inputNumber id="dl-order"
                       [ngModel]="decLevelSortOrder()" (ngModelChange)="decLevelSortOrder.set($event || 0)"
                       [showButtons]="true" [min]="0" styleClass="w-full" />
      </div>
      <div class="flex items-center gap-3 pt-6">
        <p-toggleSwitch [ngModel]="decLevelIsActive()" (ngModelChange)="decLevelIsActive.set(!!$event)"
                        inputId="dl-active" />
        <label for="dl-active" class="text-sm">Activo</label>
      </div>
    </div>

    <div class="flex justify-end gap-2 pt-2">
      <p-button label="Cancelar" severity="secondary" [outlined]="true"
                (onClick)="showDecorationLevelDialog.set(false)" type="button" />
      <p-button [label]="editingDecorationLevel() ? 'Guardar' : 'Crear'" icon="pi pi-check"
                (onClick)="saveDecorationLevel()" [loading]="decLevelSaving()" />
    </div>
  </div>
</p-dialog>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 5: Manual smoke test in browser**

1. Run `npm run start`.
2. Navigate to `/admin/experiencias`.
3. Verify three tab buttons appear: "🌸 Hula Hula", "✨ Hooping", "🎨 Decoración".
4. Click Hula Hula / Hooping → existing config loads with Glam Girls, Inclusiones, Upgrades, Actividades sections.
5. Click "🎨 Decoración" → empty table with "Nuevo nivel" button.
6. Click "Nuevo nivel" → dialog opens with Nombre, Imagen, Precio base, Incluye editor, Notas, Orden, Activo.
7. Fill: Nombre="Petite", Precio=3200, add inclusion "1 mampara grupo A", add note "Ancho: 2.50 m".
8. Click "Crear" → level appears in table with thumbnail placeholder (no image uploaded), price $3,200.
9. Edit the level → dialog pre-fills all fields.
10. Delete → confirm dialog appears → level removed.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/admin/pages/admin-experiences/admin-experiences.ts \
        src/app/features/admin/pages/admin-experiences/admin-experiences.html
git commit -m "feat(admin): add Decoración tab to Experiencias with decoration level CRUD and image upload"
```

---

### Task 4: DecorationPackagesSection — Frontend Component

**Files:**
- Create: `src/app/features/home/components/decoration-packages-section/decoration-packages-section.ts`
- Create: `src/app/features/home/components/decoration-packages-section/decoration-packages-section.html`

**Interfaces:**
- Consumes:
  - `DecorationLevel` from `src/app/core/interfaces/decoration-level.ts`
  - `DecorationLevelService.getActiveByVenue(venueId: string): Promise<DecorationLevel[]>`
  - `PublicVenueService` (existing, used identically in `PrivateEventsSection`) at `src/app/core/services/public-venue.service.ts`
  - `CurrencyMxnPipe` at `src/app/core/pipes/currency-mxn.pipe.ts`
- Produces: `DecorationPackagesSection` component with selector `app-decoration-packages-section`, consumed by Task 5.

**Context:** Follow `PrivateEventsSection` loading pattern exactly: `constructor()` calls `private async loadLevels()`. No `ngOnInit`. Section is invisible when `levels().length === 0`.

- [ ] **Step 1: Create the TypeScript component**

Create `src/app/features/home/components/decoration-packages-section/decoration-packages-section.ts`:

```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecorationLevelService } from '../../../../core/services/decoration-level.service';
import { PublicVenueService } from '../../../../core/services/public-venue.service';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import type { DecorationLevel } from '../../../../core/interfaces/decoration-level';

@Component({
  selector: 'app-decoration-packages-section',
  templateUrl: './decoration-packages-section.html',
  imports: [CurrencyMxnPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecorationPackagesSection {
  private readonly decorationLevelService = inject(DecorationLevelService);
  private readonly publicVenue = inject(PublicVenueService);

  readonly levels = signal<DecorationLevel[]>([]);

  constructor() {
    this.loadLevels();
  }

  private async loadLevels(): Promise<void> {
    const venue = this.publicVenue.activeVenue();
    if (!venue) return;
    const data = await this.decorationLevelService.getActiveByVenue(venue.id);
    this.levels.set(data);
  }
}
```

- [ ] **Step 2: Create the HTML template**

Create `src/app/features/home/components/decoration-packages-section/decoration-packages-section.html`:

```html
@if (levels().length > 0) {
  <section
    id="paquetes-decoracion"
    aria-labelledby="decoration-section-title"
    class="relative bg-[#F5EDD8] overflow-hidden py-12 md:py-20"
    style="scroll-margin-top: 6rem;">

    <!-- Título -->
    <div class="relative z-10 text-center mb-4 px-4">
      <h2 id="decoration-section-title"
          class="font-bubblegum text-5xl md:text-7xl lg:text-8xl font-black text-[#6C63FF] uppercase tracking-wide drop-shadow-sm">
        Paquetes Decoración
      </h2>
    </div>

    <!-- Subtítulo -->
    <div class="relative z-10 text-center mb-12 px-6 max-w-2xl mx-auto">
      <p class="font-display font-semibold text-base md:text-lg text-slate-700 italic">
        Todos nuestros paquetes de decoración son diseños personalizados y únicos.
      </p>
    </div>

    <!-- Cards -->
    <div class="relative z-10 flex flex-col gap-10 max-w-5xl mx-auto px-4 md:px-8">

      @for (level of levels(); track level.id; let i = $index) {
        <article
          class="flex flex-col md:flex-row rounded-3xl overflow-hidden border-4 border-[#6C63FF] shadow-xl bg-white"
          [class.md:flex-row-reverse]="i % 2 !== 0"
          [attr.aria-label]="level.name + ' — paquete de decoración'">

          <!-- Image side (55% on md+) -->
          <div class="relative md:w-[55%] flex-shrink-0 min-h-56 md:min-h-72 bg-slate-100 overflow-hidden">
            @if (level.image_url) {
              <img
                [src]="level.image_url"
                [alt]="level.name + ' — paquete de decoración'"
                class="absolute inset-0 w-full h-full object-cover" />
            } @else {
              <div class="absolute inset-0 flex items-center justify-center bg-slate-100">
                <i class="pi pi-image text-6xl text-slate-300" aria-hidden="true"></i>
              </div>
            }

            <!-- Rotated level name — positioned on left edge for even cards, right edge for odd -->
            <div
              class="absolute top-1/2 -translate-y-1/2 z-10"
              [class.left-0]="i % 2 === 0"
              [class.-translate-x-1/2]="i % 2 === 0"
              [class.right-0]="i % 2 !== 0"
              [class.translate-x-1/2]="i % 2 !== 0">
              <span
                class="font-bubblegum text-5xl md:text-6xl font-black uppercase block"
                style="writing-mode: vertical-rl; transform: rotate(180deg); color: white; -webkit-text-stroke: 2px #6C63FF; text-shadow: 0 2px 8px rgba(0,0,0,0.3);"
                aria-hidden="true">
                {{ level.name }}
              </span>
            </div>

            <!-- Dimension notes at image bottom -->
            @if (level.notes) {
              <div class="absolute bottom-0 left-0 right-0 bg-black/40 px-4 py-2 z-10">
                <p class="font-display text-xs text-white text-center whitespace-pre-line leading-relaxed">
                  {{ level.notes }}
                </p>
              </div>
            }
          </div>

          <!-- Content side (45% on md+) -->
          <div class="md:w-[45%] flex flex-col justify-between gap-6 p-6 md:p-8">

            <!-- Inclusions list -->
            <div>
              <p class="font-display font-black text-sm uppercase tracking-widest text-[#6C63FF] mb-3">
                Incluye:
              </p>
              <ul class="flex flex-col gap-2" [attr.aria-label]="'Incluye en ' + level.name">
                @for (item of level.inclusions; track item) {
                  <li class="flex gap-2 text-sm font-display text-slate-700">
                    <span class="text-[#6C63FF] font-black flex-shrink-0 leading-snug">+</span>
                    <span class="leading-snug">{{ item }}</span>
                  </li>
                }
              </ul>
            </div>

            <!-- Price badge -->
            <div class="flex" [class.justify-end]="i % 2 === 0" [class.justify-start]="i % 2 !== 0">
              <div
                class="bg-[#6C63FF] text-white rounded-full px-7 py-3 shadow-lg inline-flex items-center"
                [attr.aria-label]="'Precio: ' + (level.base_price_cents | currencyMxn)">
                <span class="font-bubblegum text-3xl md:text-4xl font-black">
                  {{ level.base_price_cents | currencyMxn }}
                </span>
              </div>
            </div>

          </div>
        </article>
      }

    </div>
  </section>
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/home/components/decoration-packages-section/
git commit -m "feat(home): add DecorationPackagesSection component"
```

---

### Task 5: Home Page Integration

**Files:**
- Modify: `src/app/features/home/pages/home-page/home-page.ts`
- Modify: `src/app/features/home/pages/home-page/home-page.html`

**Interfaces:**
- Consumes: `DecorationPackagesSection` (selector `app-decoration-packages-section`) from Task 4
- Produces: Section rendered on landing page between `PrivateEventsSection` and `PlayDaySection`

**Context — home-page.html structure to preserve:**
The template wraps `PrivateEventsSection` and `PlayDaySection` inside a `#scrollZone` div that drives a GSAP mascot animation. Both are inside this div. The new section goes between them inside the same `#scrollZone`. The `#eventsSection` and `#playDaySection` template references must NOT be removed or renamed.

Current relevant HTML (do not change the surrounding structure):
```html
<div #scrollZone class="relative overflow-x-clip">
  <img #fugaz ... />
  <div #eventsSection>
    <app-private-events-section />
  </div>
  <div #playDaySection>
    <app-play-day-section />
  </div>
</div>
```

- [ ] **Step 1: Add import to home-page.ts**

In `src/app/features/home/pages/home-page/home-page.ts`, add the import statement:

```typescript
import { DecorationPackagesSection } from '../../components/decoration-packages-section/decoration-packages-section';
```

Add `DecorationPackagesSection` to the `imports` array inside `@Component` (after `PrivateEventsSection`):

```typescript
imports: [
  HeroSection,
  PolaroidSection,
  PrivateEventsSection,
  DecorationPackagesSection,
  PlayDaySection,
  GallerySection,
  ContactSection,
  HomeFooter,
  WhatsAppFloatingWidget
],
```

- [ ] **Step 2: Insert component in home-page.html**

In `src/app/features/home/pages/home-page/home-page.html`, find the `#scrollZone` div and insert `<app-decoration-packages-section />` between `#eventsSection` and `#playDaySection`. The result should be:

```html
<div #scrollZone class="relative overflow-x-clip">
  <img
    #fugaz
    src="https://jzdfxbbnhkzdetrpmqdx.supabase.co/storage/v1/object/public/Personajes/fugaz.png"
    alt=""
    aria-hidden="true"
    width="600"
    height="400"
    class="pointer-events-none absolute left-0 top-0 z-10 w-28 md:w-40 opacity-0"
  />
  <div #eventsSection>
    <app-private-events-section />
  </div>

  <app-decoration-packages-section />

  <div #playDaySection>
    <app-play-day-section />
  </div>
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 4: End-to-end manual test**

1. In `/admin/experiencias` → "🎨 Decoración" tab, create 3 levels: Petite ($3,200), Grand ($4,600), Plus ($5,900) with inclusions and notes.
2. Navigate to `/{venue-slug}` (e.g. `/torreon`).
3. Scroll to after "Party with us!" section.
4. **"Paquetes Decoración"** section appears in `#F5EDD8` cream background.
5. Three cards show: Petite (image left), Grand (image right), Plus (image left).
6. Each card has: reference photo, rotated level name on the edge, "INCLUYE:" list with `+` items, purple price badge.
7. Dimension notes show at bottom of image.
8. Go back to admin, set one level to inactive → it disappears from the landing page.
9. Delete all levels → section disappears completely from landing page (`@if` guard works).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/home/pages/home-page/home-page.ts \
        src/app/features/home/pages/home-page/home-page.html
git commit -m "feat(home): integrate DecorationPackagesSection into landing page"
```
