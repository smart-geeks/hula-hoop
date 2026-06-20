export type AmendmentStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';

export interface AmendmentItem {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface QuoteAmendment {
  id: string;
  quote_id: string;
  contract_id: string;
  status: AmendmentStatus;
  proposed_items: AmendmentItem[];
  proposed_subtotal: number;
  proposed_descuento: number;
  proposed_total: number;
  delta_monto: number;
  payment_id: string | null;
  approval_token: string;
  notas: string | null;
  created_by: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
}
