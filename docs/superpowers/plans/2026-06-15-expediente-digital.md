# Expediente Digital — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the "Expediente Digital" card in the admin event detail Contrato tab to show/upload/replace 4 document slots (INE, Comprobante, Firma, Contrato PDF) with an admin audit legend when a client document is replaced.

**Architecture:** New `uploadDocumentAdmin` method in ContractService handles Supabase Storage upload + `doc_metadata` JSONB update in one atomic UPDATE. Component adds 3 signals and 2 methods; the HTML replaces the current single-PDF Expediente card with 4 state-driven slots.

**Tech Stack:** Angular 20 Zoneless (signals, OnPush), Supabase Storage bucket `gallery`, JSONB `doc_metadata` column on `contracts`.

---

## Files

| Status | Path | Change |
|--------|------|--------|
| Create | `supabase/migrations/20260615000002_add_doc_metadata_to_contracts.sql` | Add `doc_metadata JSONB` column |
| Modify | `src/app/core/interfaces/contract.ts` | Add `doc_metadata` to `Contract` |
| Modify | `src/app/core/services/contract.service.ts` | Add `uploadDocumentAdmin` method |
| Modify | `src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts` | Inject AuthService; add signals/computed/methods |
| Modify | `src/app/features/admin/pages/admin-event-detail/admin-event-detail.html` | Replace Expediente Digital `.space-y-4` block (lines 598-642) |

---

## Task 1: Database migration — add doc_metadata column

**Files:**
- Create: `supabase/migrations/20260615000002_add_doc_metadata_to_contracts.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260615000002_add_doc_metadata_to_contracts.sql
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS doc_metadata JSONB DEFAULT '{}';
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with:
- project_id: `gcgpyxvbqfwvoszpyckx`
- name: `add_doc_metadata_to_contracts`
- query: the SQL above

- [ ] **Step 3: Verify the column exists**

Use `mcp__claude_ai_Supabase__execute_sql`:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'contracts' AND column_name = 'doc_metadata';
```

Expected: one row with `data_type = jsonb` and `column_default = '{}'::jsonb`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260615000002_add_doc_metadata_to_contracts.sql
git commit -m "feat: add doc_metadata JSONB column to contracts for admin document audit trail"
```

---

## Task 2: Contract interface + ContractService method

**Files:**
- Modify: `src/app/core/interfaces/contract.ts:13-37`
- Modify: `src/app/core/services/contract.service.ts` (after line 184)

- [ ] **Step 1: Add `doc_metadata` to Contract interface**

In `src/app/core/interfaces/contract.ts`, add one field after `firma_url`:

```typescript
export interface Contract {
  id: string;
  venue_id: string;
  folio: string;
  quote_id: string | null;
  client_id: string | null;
  fecha_firma: string | null;
  fecha_evento: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  salon_renta: number;
  total_contrato: number;
  deposito_pagado: number;
  saldo_pendiente: number;
  estado: ContractStatus;
  pdf_url: string | null;
  ine_url?: string | null;
  comprobante_url?: string | null;
  firma_url?: string | null;
  doc_metadata?: Record<string, { replaced_by: string; replaced_at: string } | null> | null;
  notas: string | null;
  created_at: string;
  // Relations
  client?: { nombre: string; email: string | null; telefono: string | null };
  payments?: ContractPayment[];
}
```

Do **NOT** add `doc_metadata` to `CreateContractData` or `UpdateContractData`.

- [ ] **Step 2: Add `uploadDocumentAdmin` method to ContractService**

In `src/app/core/services/contract.service.ts`, insert after line 184 (after the closing brace of `uploadDocument`):

```typescript
async uploadDocumentAdmin(
  contractId: string,
  field: 'ine' | 'comprobante' | 'firma' | 'pdf',
  file: File,
  replacedByName: string,
  currentMeta: Record<string, { replaced_by: string; replaced_at: string } | null>,
): Promise<Contract | null> {
  const client = this.supabase.client;
  if (!client) return null;

  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `contracts/${field}/${contractId}-${Date.now()}.${ext}`;

  const { error: uploadError } = await client.storage
    .from('gallery')
    .upload(fileName, file, { cacheControl: '3600', upsert: true });

  if (uploadError) {
    console.error(`Error uploading ${field}:`, uploadError);
    return null;
  }

  const { data: publicUrlData } = client.storage
    .from('gallery')
    .getPublicUrl(fileName);

  const publicUrl = publicUrlData?.publicUrl;
  if (!publicUrl) return null;

  const urlField = field === 'pdf' ? 'pdf_url' : `${field}_url`;
  const newMeta = {
    ...currentMeta,
    [field]: { replaced_by: replacedByName, replaced_at: new Date().toISOString() },
  };

  const { error } = await client
    .from('contracts')
    .update({ [urlField]: publicUrl, doc_metadata: newMeta })
    .eq('id', contractId);

  if (error) {
    console.error(`Error updating contract ${field}:`, error);
    return null;
  }

  return this.getById(contractId);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `doc_metadata` or `uploadDocumentAdmin`.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/interfaces/contract.ts src/app/core/services/contract.service.ts
git commit -m "feat: add doc_metadata field to Contract interface and uploadDocumentAdmin service method"
```

---

## Task 3: Component TS — inject AuthService, add signals/computed/methods

**Files:**
- Modify: `src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts`

The current component starts at line 1. Key insertion points:
- Line 15: imports block (add AuthService import)
- Line 39: injections block (add authService injection)
- After the `tareasBorderClass` computed (~line 144): add new signals/computed
- After `onContractFileUpload` (~line 483): add new methods

- [ ] **Step 1: Add AuthService import**

After line 15 (`import { SupabaseService }...`), add:

```typescript
import { AuthService } from '../../../../core/services/auth.service';
```

- [ ] **Step 2: Inject AuthService in the class body**

After the `private readonly router = inject(Router);` line (~line 40), add:

```typescript
private readonly authService   = inject(AuthService);
```

- [ ] **Step 3: Add document-upload signals and computed after `tareasBorderClass`**

After the closing of `tareasBorderClass` computed (~line 144), add:

```typescript
// ── Expediente Digital ────────────────────────────────
readonly uploadingDoc   = signal<'ine' | 'comprobante' | 'firma' | 'pdf' | null>(null);
readonly expandedReplace = signal<string | null>(null);

readonly docMeta = computed(() =>
  (this.contract()?.doc_metadata ?? {}) as Record<
    string,
    { replaced_by: string; replaced_at: string } | null
  >,
);
```

- [ ] **Step 4: Add `onDocUpload` and `toggleReplace` methods**

After `onContractFileUpload` (~line 483), add:

```typescript
toggleReplace(field: string): void {
  this.expandedReplace.update((cur) => (cur === field ? null : field));
}

async onDocUpload(
  field: 'ine' | 'comprobante' | 'firma' | 'pdf',
  event: Event,
): Promise<void> {
  const c = this.contract();
  if (!c) return;

  const input = event.target as HTMLInputElement;
  if (!input?.files?.length) return;
  const file = input.files[0];

  const adminName = this.authService.userProfile()?.full_name ?? 'Admin';
  this.uploadingDoc.set(field);

  const updated = await this.contractService.uploadDocumentAdmin(
    c.id,
    field,
    file,
    adminName,
    this.docMeta(),
  );

  this.uploadingDoc.set(null);
  this.expandedReplace.set(null);

  if (updated) {
    this.contract.set(updated);
    this.showToast('success', 'Documento subido correctamente');
  } else {
    this.showToast('error', 'Error al subir el documento');
  }

  input.value = '';
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts
git commit -m "feat: add document upload signals and methods to AdminEventDetail for Expediente Digital"
```

---

## Task 4: Component HTML — replace Expediente Digital block

**Files:**
- Modify: `src/app/features/admin/pages/admin-event-detail/admin-event-detail.html` (lines 598-642)

The current block is the `<div class="space-y-4">` inside the "Expediente Digital" card. Replace everything from `<div class="space-y-4">` (line 598) through its closing `</div>` (line 642, which is the last `</div>` before `</div>` at 643 that closes the card).

**Important:** Keep the outer card wrapper and `<h3>Expediente Digital</h3>` header unchanged. Only the inner `<div class="space-y-4">` content changes.

- [ ] **Step 1: Replace the Expediente Digital inner content**

The old content (lines 598–642):
```html
        <div class="space-y-4">
          @if (contract()?.pdf_url) {
            ...
          } @else {
            ...
          }

          <div class="space-y-2">
            <label ...>Subir contrato firmado (PDF / Imagen)</label>
            <div class="relative border border-dashed ...">
              <input type="file" (change)="onContractFileUpload($event)" .../>
              ...
            </div>
          </div>
        </div>
```

Replace with this complete block:

```html
        <div class="space-y-3">

          <!-- Slot 1: INE -->
          <div class="rounded-xl border p-4 text-xs transition-colors"
               [class]="contract()?.ine_url ? 'border-emerald-200 bg-emerald-50/40' : 'border-dashed border-slate-200 bg-white'">
            <div class="flex items-center justify-between mb-2">
              <span class="font-semibold text-slate-700 flex items-center gap-1.5">
                <i class="pi pi-id-card text-slate-400"></i> INE
              </span>
              @if (contract()?.ine_url) {
                <span class="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">✓ Subido</span>
              } @else {
                <span class="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">✗ Falta</span>
              }
            </div>

            @if (contract()?.ine_url) {
              <div class="flex flex-wrap gap-2 mb-2">
                <a [href]="contract()?.ine_url" target="_blank"
                   class="inline-flex items-center gap-1 text-rojo-brillante font-semibold hover:underline">
                  <i class="pi pi-external-link text-[10px]"></i> Ver
                </a>
                <button type="button" (click)="toggleReplace('ine')"
                        class="inline-flex items-center gap-1 text-slate-500 font-semibold hover:text-slate-700">
                  <i class="pi pi-refresh text-[10px]"></i>
                  Reemplazar
                  <i class="pi text-[10px]" [class]="expandedReplace() === 'ine' ? 'pi-chevron-up' : 'pi-chevron-down'"></i>
                </button>
              </div>
              @if (docMeta()['ine']) {
                <p class="text-[10px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mb-2">
                  <i class="pi pi-info-circle"></i>
                  Reemplazado por <strong>{{ docMeta()['ine']!.replaced_by }}</strong>
                  · {{ docMeta()['ine']!.replaced_at | date:'d MMM yyyy, h:mm a':'':'es-MX' }}
                </p>
              }
            }

            @if (!contract()?.ine_url || expandedReplace() === 'ine') {
              <div class="flex flex-wrap gap-2 mt-1">
                <label class="cursor-pointer relative">
                  <input type="file" accept="image/*,application/pdf"
                         class="sr-only"
                         [disabled]="uploadingDoc() === 'ine'"
                         (change)="onDocUpload('ine', $event)" />
                  <span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors">
                    @if (uploadingDoc() === 'ine') {
                      <i class="pi pi-spin pi-spinner text-xs"></i> Subiendo…
                    } @else {
                      <i class="pi pi-upload text-xs"></i> Subir archivo
                    }
                  </span>
                </label>
                <label class="cursor-pointer relative">
                  <input type="file" accept="image/*" capture="environment"
                         class="sr-only"
                         [disabled]="uploadingDoc() === 'ine'"
                         (change)="onDocUpload('ine', $event)" />
                  <span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors">
                    <i class="pi pi-camera text-xs"></i> Tomar foto
                  </span>
                </label>
              </div>
            }
          </div>

          <!-- Slot 2: Comprobante de domicilio -->
          <div class="rounded-xl border p-4 text-xs transition-colors"
               [class]="contract()?.comprobante_url ? 'border-emerald-200 bg-emerald-50/40' : 'border-dashed border-slate-200 bg-white'">
            <div class="flex items-center justify-between mb-2">
              <span class="font-semibold text-slate-700 flex items-center gap-1.5">
                <i class="pi pi-home text-slate-400"></i> Comprobante de domicilio
              </span>
              @if (contract()?.comprobante_url) {
                <span class="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">✓ Subido</span>
              } @else {
                <span class="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">✗ Falta</span>
              }
            </div>

            @if (contract()?.comprobante_url) {
              <div class="flex flex-wrap gap-2 mb-2">
                <a [href]="contract()?.comprobante_url" target="_blank"
                   class="inline-flex items-center gap-1 text-rojo-brillante font-semibold hover:underline">
                  <i class="pi pi-external-link text-[10px]"></i> Ver
                </a>
                <button type="button" (click)="toggleReplace('comprobante')"
                        class="inline-flex items-center gap-1 text-slate-500 font-semibold hover:text-slate-700">
                  <i class="pi pi-refresh text-[10px]"></i>
                  Reemplazar
                  <i class="pi text-[10px]" [class]="expandedReplace() === 'comprobante' ? 'pi-chevron-up' : 'pi-chevron-down'"></i>
                </button>
              </div>
              @if (docMeta()['comprobante']) {
                <p class="text-[10px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mb-2">
                  <i class="pi pi-info-circle"></i>
                  Reemplazado por <strong>{{ docMeta()['comprobante']!.replaced_by }}</strong>
                  · {{ docMeta()['comprobante']!.replaced_at | date:'d MMM yyyy, h:mm a':'':'es-MX' }}
                </p>
              }
            }

            @if (!contract()?.comprobante_url || expandedReplace() === 'comprobante') {
              <div class="flex flex-wrap gap-2 mt-1">
                <label class="cursor-pointer relative">
                  <input type="file" accept="image/*,application/pdf"
                         class="sr-only"
                         [disabled]="uploadingDoc() === 'comprobante'"
                         (change)="onDocUpload('comprobante', $event)" />
                  <span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors">
                    @if (uploadingDoc() === 'comprobante') {
                      <i class="pi pi-spin pi-spinner text-xs"></i> Subiendo…
                    } @else {
                      <i class="pi pi-upload text-xs"></i> Subir archivo
                    }
                  </span>
                </label>
                <label class="cursor-pointer relative">
                  <input type="file" accept="image/*" capture="environment"
                         class="sr-only"
                         [disabled]="uploadingDoc() === 'comprobante'"
                         (change)="onDocUpload('comprobante', $event)" />
                  <span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors">
                    <i class="pi pi-camera text-xs"></i> Tomar foto
                  </span>
                </label>
              </div>
            }
          </div>

          <!-- Slot 3: Firma digital -->
          <div class="rounded-xl border p-4 text-xs transition-colors"
               [class]="contract()?.firma_url ? 'border-emerald-200 bg-emerald-50/40' : 'border-dashed border-slate-200 bg-white'">
            <div class="flex items-center justify-between mb-2">
              <span class="font-semibold text-slate-700 flex items-center gap-1.5">
                <i class="pi pi-pen-to-square text-slate-400"></i> Firma digital
              </span>
              @if (contract()?.firma_url) {
                <span class="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">✓ Firmado</span>
              } @else {
                <span class="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">✗ Pendiente</span>
              }
            </div>

            @if (contract()?.firma_url) {
              <div class="flex flex-wrap gap-2 mb-2">
                <a [href]="contract()?.firma_url" target="_blank"
                   class="inline-flex items-center gap-1 text-rojo-brillante font-semibold hover:underline">
                  <i class="pi pi-external-link text-[10px]"></i> Ver
                </a>
                <button type="button" (click)="toggleReplace('firma')"
                        class="inline-flex items-center gap-1 text-slate-500 font-semibold hover:text-slate-700">
                  <i class="pi pi-refresh text-[10px]"></i>
                  Reemplazar
                  <i class="pi text-[10px]" [class]="expandedReplace() === 'firma' ? 'pi-chevron-up' : 'pi-chevron-down'"></i>
                </button>
              </div>
              @if (docMeta()['firma']) {
                <p class="text-[10px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mb-2">
                  <i class="pi pi-info-circle"></i>
                  Reemplazado por <strong>{{ docMeta()['firma']!.replaced_by }}</strong>
                  · {{ docMeta()['firma']!.replaced_at | date:'d MMM yyyy, h:mm a':'':'es-MX' }}
                </p>
              }
            }

            @if (!contract()?.firma_url || expandedReplace() === 'firma') {
              <div class="flex flex-wrap gap-2 mt-1">
                <label class="cursor-pointer relative">
                  <input type="file" accept="image/*,application/pdf"
                         class="sr-only"
                         [disabled]="uploadingDoc() === 'firma'"
                         (change)="onDocUpload('firma', $event)" />
                  <span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors">
                    @if (uploadingDoc() === 'firma') {
                      <i class="pi pi-spin pi-spinner text-xs"></i> Subiendo…
                    } @else {
                      <i class="pi pi-upload text-xs"></i> Subir archivo
                    }
                  </span>
                </label>
              </div>
            }
          </div>

          <!-- Slot 4: Contrato firmado (PDF) -->
          <div class="rounded-xl border p-4 text-xs transition-colors"
               [class]="contract()?.pdf_url ? 'border-emerald-200 bg-emerald-50/40' : 'border-dashed border-slate-200 bg-white'">
            <div class="flex items-center justify-between mb-2">
              <span class="font-semibold text-slate-700 flex items-center gap-1.5">
                <i class="pi pi-file-pdf text-slate-400"></i> Contrato firmado
              </span>
              @if (contract()?.pdf_url) {
                <span class="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">✓ Cargado</span>
              } @else {
                <span class="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">✗ Falta</span>
              }
            </div>

            @if (contract()?.pdf_url) {
              <div class="flex flex-wrap gap-2 mb-2">
                <a [href]="contract()?.pdf_url" target="_blank"
                   class="inline-flex items-center gap-1 text-rojo-brillante font-semibold hover:underline">
                  <i class="pi pi-external-link text-[10px]"></i> Ver
                </a>
                <button type="button" (click)="toggleReplace('pdf')"
                        class="inline-flex items-center gap-1 text-slate-500 font-semibold hover:text-slate-700">
                  <i class="pi pi-refresh text-[10px]"></i>
                  Reemplazar
                  <i class="pi text-[10px]" [class]="expandedReplace() === 'pdf' ? 'pi-chevron-up' : 'pi-chevron-down'"></i>
                </button>
              </div>
              @if (docMeta()['pdf']) {
                <p class="text-[10px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mb-2">
                  <i class="pi pi-info-circle"></i>
                  Reemplazado por <strong>{{ docMeta()['pdf']!.replaced_by }}</strong>
                  · {{ docMeta()['pdf']!.replaced_at | date:'d MMM yyyy, h:mm a':'':'es-MX' }}
                </p>
              }
            }

            @if (!contract()?.pdf_url || expandedReplace() === 'pdf') {
              <div class="flex flex-wrap gap-2 mt-1">
                <label class="cursor-pointer relative">
                  <input type="file" accept="image/*,application/pdf"
                         class="sr-only"
                         [disabled]="uploadingDoc() === 'pdf'"
                         (change)="onDocUpload('pdf', $event)" />
                  <span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors">
                    @if (uploadingDoc() === 'pdf') {
                      <i class="pi pi-spin pi-spinner text-xs"></i> Subiendo…
                    } @else {
                      <i class="pi pi-upload text-xs"></i> Subir archivo
                    }
                  </span>
                </label>
              </div>
            }
          </div>

        </div>
```

- [ ] **Step 2: Verify TypeScript and build pass**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/admin/pages/admin-event-detail/admin-event-detail.html
git commit -m "feat: expand Expediente Digital to 4 document slots with upload, replace, and admin audit legend"
```

---

## Task 5: Build verification

**Files:** None (read-only verification)

- [ ] **Step 1: Run Angular production build**

```bash
cd /home/eduardo/Proyectos/hula-hoop && npm run build 2>&1 | tail -30
```

Expected: `Build at: ... - Hash: ...` with 0 errors.

- [ ] **Step 2: Confirm all 5 files changed**

```bash
git log --oneline -5
git diff HEAD~4..HEAD --name-only
```

Expected files listed:
- `supabase/migrations/20260615000002_add_doc_metadata_to_contracts.sql`
- `src/app/core/interfaces/contract.ts`
- `src/app/core/services/contract.service.ts`
- `src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts`
- `src/app/features/admin/pages/admin-event-detail/admin-event-detail.html`

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| `doc_metadata JSONB` column | Task 1 |
| `doc_metadata` in Contract interface | Task 2 |
| `uploadDocumentAdmin` with COALESCE-safe metadata | Task 2 |
| AuthService injection + `adminName` | Task 3 |
| `uploadingDoc` / `expandedReplace` / `docMeta` signals | Task 3 |
| `onDocUpload` + `toggleReplace` methods | Task 3 |
| 4 slots: INE, Comprobante, Firma, PDF | Task 4 |
| Camera (`capture="environment"`) for INE + Comprobante | Task 4 ✓ |
| No camera for Firma (digital) or PDF | Task 4 ✓ |
| URL present / no metadata → "Subido", no legend | Task 4 ✓ |
| URL present + metadata → amber legend with name+date | Task 4 ✓ |
| No URL → dashed border, upload buttons | Task 4 ✓ |
| Spinner per slot during upload | Task 4 ✓ |
| `input.value = ''` reset after upload | Task 3 ✓ |
| `expandedReplace` clears on successful upload | Task 3 ✓ |
| Existing `uploadDocument` (public page) unchanged | Not touched ✓ |

**Placeholder scan:** No TBDs or incomplete sections found.

**Type consistency:** `field: 'ine' | 'comprobante' | 'firma' | 'pdf'` matches across all tasks. `docMeta()` computed returns `Record<string, { replaced_by: string; replaced_at: string } | null>` — used consistently in template with `docMeta()['ine']!.replaced_by`.

**One note:** The `date` pipe in the template uses `'es-MX'` as the 3rd (locale) param — this is the existing codebase pattern for `DatePipe` and is correct (it differs from `CurrencyPipe` where the 4th param is redundant).
