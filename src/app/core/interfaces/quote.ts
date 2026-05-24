export type QuoteStatus = 'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'vencida';

export interface QuoteItem {
  id: string;
  quote_id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface Quote {
  id: string;
  venue_id: string;
  folio: string;
  public_token: string;
  client_id: string | null;
  fecha: string;
  fecha_evento: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  guest_count: number | null;
  estado: QuoteStatus;
  subtotal: number;
  descuento: number;
  total: number;
  deposit_amount: number | null;
  notas: string | null;
  created_at: string;
  // Relations
  client?: { nombre: string; email: string | null; telefono: string | null };
  items?: QuoteItem[];
}

export interface CreateQuoteData {
  venue_id?: string;
  client_id?: string;
  fecha: string;
  fecha_evento?: string;
  hora_inicio?: string;
  hora_fin?: string;
  guest_count?: number;
  estado?: QuoteStatus;
  subtotal: number;
  descuento?: number;
  total: number;
  deposit_amount?: number;
  notas?: string;
  items: Omit<QuoteItem, 'id' | 'quote_id' | 'subtotal'>[];
}

export type UpdateQuoteData = Partial<Omit<CreateQuoteData, 'items'>>;
