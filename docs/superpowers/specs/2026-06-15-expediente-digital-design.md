# Diseño: Expediente Digital con Gestión de Documentos

**Fecha:** 2026-06-15  
**Archivos objetivo:** `admin-event-detail/`, `contract.service.ts`

---

## Problema

El tab "Contrato" del detalle de evento tiene una sección "Expediente Digital" que solo maneja `pdf_url` (contrato firmado). Las columnas `ine_url`, `comprobante_url` y `firma_url` — recién agregadas a la BD — no tienen UI de administración. El admin no puede ver ni subir estos documentos desde el panel.

---

## Solución

Expandir el card "Expediente Digital" existente para mostrar 4 slots de documentos con capacidad de ver, subir (archivo o cámara) y reemplazar. Cuando el admin reemplaza un documento subido originalmente por el cliente, se guarda una leyenda con el nombre del admin y la fecha.

---

## Modelo de datos

### Nueva columna en `contracts`

```sql
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS doc_metadata JSONB DEFAULT '{}';
```

### Estructura del JSONB

```json
{
  "ine":         { "replaced_by": "Eduardo Baltazar", "replaced_at": "2026-06-15T10:30:00Z" },
  "comprobante": { "replaced_by": "María López",      "replaced_at": "2026-06-15T11:00:00Z" },
  "firma":       null,
  "pdf":         null
}
```

### Regla de interpretación por slot

| URL presente | `doc_metadata[field]` | Estado mostrado |
|---|---|---|
| No | — | ✗ Falta — mostrar botones de subida |
| Sí | `null` o ausente | ✓ Cliente — subido desde página pública |
| Sí | `{ replaced_by, replaced_at }` | ✓ Admin — con leyenda de reemplazo |

---

## Los 4 slots de documentos

| # | Nombre | Campo URL | Cámara disponible |
|---|--------|-----------|-------------------|
| 1 | INE | `ine_url` | Sí |
| 2 | Comprobante de domicilio | `comprobante_url` | Sí |
| 3 | Firma digital | `firma_url` | No (es firma digital) |
| 4 | Contrato firmado | `pdf_url` | No (es PDF) |

---

## Estados visuales por slot

### Sin documento
```
🪪 INE                              ✗ Falta
[📁 Subir archivo]  [📷 Tomar foto]
```

### Subido por el cliente (URL existe, sin metadata)
```
🪪 INE                              ✓ Cliente
[👁 Ver]  [🔄 Reemplazar ▾]
```
Al expandir "Reemplazar": aparecen los botones de subida.

### Reemplazado por admin (URL + metadata)
```
🪪 INE                              ✓ Admin
[👁 Ver]  [🔄 Reemplazar ▾]
⚠ Reemplazado por Eduardo Baltazar · 15 jun 2026, 10:30 AM
```

---

## Flujo de subida

1. Admin hace click en "Subir archivo" o "Tomar foto"
2. Se activa un `<input type="file">` oculto:
   - Archivo: `accept="image/*,application/pdf"`
   - Cámara: `accept="image/*" capture="environment"`
3. Al seleccionar el archivo, se llama `ContractService.uploadDocument(contractId, field, file, adminName)`
4. El service:
   a. Sube el archivo a Supabase Storage (bucket `contracts`, ruta `{contractId}/{field}-{timestamp}.{ext}`)
   b. Hace `UPDATE contracts SET {field}_url = $url, doc_metadata = doc_metadata || $patch WHERE id = $id`
   c. Retorna el contrato actualizado
5. El componente actualiza `contract` signal y muestra toast de éxito
6. El spinner individual del slot desaparece

---

## Cambios por archivo

### `supabase/migrations/20260615000002_add_doc_metadata_to_contracts.sql`
- `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS doc_metadata JSONB DEFAULT '{}'`

### `src/app/core/services/contract.service.ts`
- Nuevo método: `uploadDocument(contractId: string, field: 'ine' | 'comprobante' | 'firma' | 'pdf', file: File, replacedByName: string): Promise<Contract | null>`
  - Sube el archivo a Storage
  - Actualiza URL + `doc_metadata` via UPDATE: `SET doc_metadata = COALESCE(doc_metadata, '{}') || $patch` para compatibilidad con contratos existentes que tienen `doc_metadata = NULL`
  - Retorna el contrato completo actualizado

### `src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts`
- Inyectar `AuthService` (ya existe en el proyecto)
- Nuevo signal: `uploadingDoc = signal<'ine' | 'comprobante' | 'firma' | 'pdf' | null>(null)`
- Nuevo signal: `expandedReplace = signal<string | null>(null)` — controla cuál slot tiene expandido el menú de reemplazo
- Computed: `docMeta = computed(() => this.contract()?.doc_metadata ?? {})`
- Nuevo método: `onDocUpload(field, event, mode: 'file' | 'camera')` — maneja el input change

### `src/app/features/admin/pages/admin-event-detail/admin-event-detail.html`
- Reemplazar el contenido del card "Expediente Digital" por los 4 slots
- Inputs ocultos por slot (archivo y cámara donde aplica)
- Leyenda de reemplazo condicional bajo cada slot

---

## Lo que NO cambia

- La lógica del visor del contrato legal (columna izquierda)
- Los botones de compartir por email/WhatsApp
- El control de estado del contrato
- La página pública de firma del cliente (`/contrato/:id`)
- Los otros tabs (Pagos, Tareas, Gastos, etc.)
