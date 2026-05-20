export type PurchaseStatus = 'pendiente' | 'recibida' | 'cancelada';

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface Purchase {
  id: string;
  folio: string;
  supplier_id: string | null;
  contract_id: string | null;
  fecha: string;
  total: number;
  estado: PurchaseStatus;
  notas: string | null;
  created_at: string;
  // Relations
  supplier?: { nombre: string };
  contract?: { folio: string; fecha_evento: string };
  items?: PurchaseItem[];
}

export interface CreatePurchaseData {
  supplier_id?: string;
  contract_id?: string;
  fecha: string;
  total: number;
  estado?: PurchaseStatus;
  notas?: string;
  items: Omit<PurchaseItem, 'id' | 'purchase_id' | 'subtotal'>[];
}

export type UpdatePurchaseData = Partial<Omit<CreatePurchaseData, 'items'>>;
