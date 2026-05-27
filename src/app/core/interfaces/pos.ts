export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia';

// ── Cajeros ───────────────────────────────────────────────────────────────────
// pin_hash no se incluye intencionalmente: el cliente nunca debe leerlo.
// Toda validación/mutación de PIN pasa por RPCs SECURITY DEFINER en Supabase.
export interface CashierProfile {
  id: string;
  venue_id: string;
  nombre: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

// ── Sesiones ──────────────────────────────────────────────────────────────────
export interface PosSession {
  id: string;
  venue_id: string;
  contract_id: string | null;
  cashier_id: string | null;
  opened_at: string;
  closed_at: string | null;
  total_ventas: number;
  created_by: string | null;
  // Relations
  contract?: { folio: string; fecha_evento: string };
  cashier?: { nombre: string };
}

// ── Items de venta ────────────────────────────────────────────────────────────
export interface PosSaleItem {
  id: string;
  sale_id: string;
  item_id?: string | null;
  restaurant_item_id?: string | null;
  extra_id?: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  // Relations
  item?: { nombre: string; sku: string | null };
  restaurant_item?: { name: string };
  extra?: { name: string };
}

// ── Venta ─────────────────────────────────────────────────────────────────────
export interface PosSale {
  id: string;
  session_id: string;
  cashier_id: string | null;
  folio: string;
  total: number;
  pagado_con: PaymentMethod;
  created_at: string;
  items?: PosSaleItem[];
  cashier?: { nombre: string };
}

// ── Carrito (estado local, no persiste en BD) ─────────────────────────────────
export interface CartItem {
  id: string;
  tipo: 'inventario' | 'restaurante' | 'extra';
  nombre: string;
  sku: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

// ── Payload para registrar una venta ─────────────────────────────────────────
export interface CreateSaleData {
  session_id: string;
  cashier_id: string | null;
  total: number;
  pagado_con: PaymentMethod;
  items: Omit<PosSaleItem, 'id' | 'sale_id' | 'subtotal'>[];
  // Cost center fields (Fase 4 — transaction-level scoping)
  contract_id?: string | null;
  playdate_date?: string | null;
  playdate_time_slot_id?: string | null;
}
