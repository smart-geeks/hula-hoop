# Quote Amendments — Modificaciones de Contrato Post-Firma

**Fecha:** 2026-06-20  
**Estado:** Aprobado para implementación

---

## Problema

Una vez que un cliente aparta su fecha y firma el contrato, puede querer agregar extras, actividades, upgrades de decoración, o quitar algo. El sistema no tiene mecanismo para esto. Se necesita:

1. Que el admin pueda editar la cotización vinculada al contrato
2. Que el pago del extra se registre correctamente (en contrato Y corte de caja)
3. Que el cliente deba autorizar los cambios desde el portal público
4. Que el contrato y la cotización reflejen los cambios aprobados

---

## Flujo

```
Admin edita cotización (inline en pestaña Cotización del event detail)
  → Guarda borrador del amendment
    → Admin registra pago del extra (modal existente, tipo='extra')
      → Post-pago: modal ofrece enviar al cliente (WhatsApp/email con link)
        → Cliente abre portal → ve resumen de cambios → "Autorizo" o "Rechazar"
          → Si aprueba: quote_items actualizado, contract.total_contrato actualizado
          → Si rechaza: amendment=rejected, pago queda como crédito
```

---

## Modelo de datos

### Nueva tabla: `quote_amendments`

```sql
CREATE TABLE quote_amendments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id         UUID NOT NULL REFERENCES quotes(id),
  contract_id      UUID NOT NULL REFERENCES contracts(id),
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected')),
  proposed_items   JSONB NOT NULL DEFAULT '[]',
  proposed_subtotal INTEGER NOT NULL DEFAULT 0,
  proposed_descuento INTEGER NOT NULL DEFAULT 0,
  proposed_total   INTEGER NOT NULL DEFAULT 0,
  delta_monto      INTEGER NOT NULL DEFAULT 0,
  payment_id       UUID REFERENCES contract_payments(id),
  approval_token   TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  notas            TEXT,
  created_by       UUID REFERENCES profiles(id),
  approved_at      TIMESTAMPTZ,
  rejected_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE quote_amendments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage amendments"
  ON quote_amendments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Public read by approval_token"
  ON quote_amendments FOR SELECT
  USING (true); -- filtrado por token en la query
```

### Columna nueva en `contract_payments`

```sql
ALTER TABLE contract_payments
  ADD COLUMN tipo TEXT NOT NULL DEFAULT 'abono'
  CHECK (tipo IN ('anticipo', 'abono', 'liquidacion', 'extra'));
```

---

## Componentes nuevos / modificados

### 1. `QuoteAmendmentService` (nuevo)

Métodos:
- `createDraft(contractId, quoteId, proposedItems, proposedTotals, notas)` → `QuoteAmendment`
- `updateDraft(amendmentId, items, totals)` → `QuoteAmendment`
- `linkPayment(amendmentId, paymentId)` → actualiza status a `pending_approval`
- `getByContract(contractId)` → `QuoteAmendment[]`
- `getByToken(token)` → `QuoteAmendment | null`
- `approve(token)` → aplica cambios a quote + contract, status = `approved`
- `reject(token)` → status = `rejected`

### 2. Interfaz `QuoteAmendment` (nueva en `core/interfaces/`)

```typescript
export type AmendmentStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';

export interface QuoteAmendment {
  id: string;
  quote_id: string;
  contract_id: string;
  status: AmendmentStatus;
  proposed_items: Array<{ descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }>;
  proposed_subtotal: number;
  proposed_descuento: number;
  proposed_total: number;
  delta_monto: number;
  payment_id: string | null;
  approval_token: string;
  notas: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
}
```

### 3. `admin-event-detail` — Pestaña Cotización (modificado)

**Estado normal:**
- Tabla de items de solo lectura (como ahora)
- Badge de estado del amendment activo si existe (`pending_approval` → chip amarillo "Pendiente de autorización")
- Botón "✏️ Modificar Cotización" — visible solo si `contract.estado = 'firmado'` y no hay amendment en `pending_approval`

**Modo edición (inline):**
- Items editables: qty y precio_unitario por línea, botón eliminar
- Sección "+ Agregar":
  - Dropdown del catálogo `extras` (con precio precargado)
  - O línea libre (descripción + precio)
- Footer en tiempo real:
  - Subtotal anterior / nuevo / diferencia (en naranja si positivo)
- Botones: "Cancelar" | "Guardar y Registrar Pago →"

**Modal de pago (extensión del existente):**
- Monto pre-rellenado con el delta
- Método de pago (efectivo/tarjeta/transferencia)
- Notas pre-rellenadas con descripción del cambio
- Al confirmar: `contractService.addPayment(..., tipo='extra')` + `amendmentService.linkPayment(...)`

**Modal post-pago:**
- "✅ Pago de $X,XXX registrado"
- Botones: "Enviar por WhatsApp ↗" | "Enviar por Email ↗" | "Copiar link"
- WhatsApp usa mensaje precargado con link al portal

### 4. Portal público `/contrato/:id` (modificado)

Cuando hay amendment en `pending_approval`:

- Banner al inicio: "📋 Modificación pendiente de autorización"
- Tabla de cambios:
  - Items anteriores (tachados los eliminados)
  - Items nuevos (marcados con ➕)
  - Nuevo total vs anterior
  - Monto ya pagado por el extra
- Botón primario: "✓ Autorizo los cambios" → llama `amendmentService.approve(token)` → reload
- Botón secundario: "Rechazar" → llama `amendmentService.reject(token)` → mensaje de confirmación

### 5. Corte de caja (modificado)

El query del corte de caja agrega un bloque de "Cobros por contratos" que incluye `contract_payments` del día agrupados por `metodo`:
- Anticipo: $X
- Extras: $X
- Abonos: $X
- Total contratos: $X

---

## Restricciones de negocio

- Solo un amendment activo por contrato a la vez (`status IN ('draft', 'pending_approval')`)
- No se puede crear amendment si `contract.estado` es `concluido` o `cancelado`
- El delta puede ser positivo (cliente paga más) o negativo (descuento/devolución)
- Si el cliente rechaza: el pago queda registrado pero el admin debe decidir qué hacer (crédito, devolución) — fuera del scope de esta versión
- La quote solo se actualiza físicamente cuando el cliente aprueba (no antes)

---

## Lo que NO cambia

- Sistema de pagos existente (modal, tickets de impresora)
- Firma del contrato original
- PDF del contrato (siempre muestra los items del quote vinculado, que se actualiza al aprobar)
- RLS existente en quotes y contracts

---

## Archivos a crear / modificar

| Archivo | Acción |
|---|---|
| `supabase/migrations/YYYYMMDD_quote_amendments.sql` | Crear tabla + RLS + columna tipo en contract_payments |
| `src/app/core/interfaces/quote-amendment.ts` | Nueva interfaz |
| `src/app/core/services/quote-amendment.service.ts` | Nuevo servicio |
| `src/app/features/admin/pages/admin-event-detail/admin-event-detail.ts` | Agregar lógica de amendment |
| `src/app/features/admin/pages/admin-event-detail/admin-event-detail.html` | UI de edición inline + modal post-pago |
| `src/app/features/contracts/pages/contract-public-page/contract-public-page.ts` | Cargar amendment por token |
| `src/app/features/contracts/pages/contract-public-page/contract-public-page.html` | Banner + botones de aprobación |
| `src/app/core/interfaces/contract.ts` | Agregar tipo a ContractPayment |
| `src/app/core/services/contract.service.ts` | Pasar tipo en addPayment |
