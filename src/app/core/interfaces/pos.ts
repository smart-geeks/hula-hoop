export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia';

export interface PosSession {
  id: string;
  contract_id: string | null;
  opened_at: string;
  closed_at: string | null;
  total_ventas: number;
  created_by: string | null;
  // Relations
  contract?: { folio: string; fecha_evento: string };
}

export interface PosSaleItem {
  id: string;
  sale_id: string;
  item_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  // Relations
  item?: { nombre: string; sku: string | null };
}

export interface PosSale {
  id: string;
  session_id: string;
  folio: string;
  total: number;
  pagado_con: PaymentMethod;
  created_at: string;
  items?: PosSaleItem[];
}

export interface CartItem {
  item_id: string;
  nombre: string;
  sku: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface CreateSaleData {
  session_id: string;
  total: number;
  pagado_con: PaymentMethod;
  items: Omit<PosSaleItem, 'id' | 'sale_id' | 'subtotal'>[];
}
