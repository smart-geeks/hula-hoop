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
  folio: string;
  client_id: string | null;
  fecha: string;
  fecha_evento: string | null;
  estado: QuoteStatus;
  subtotal: number;
  descuento: number;
  total: number;
  notas: string | null;
  created_at: string;
  // Relations
  client?: { nombre: string; email: string | null; telefono: string | null };
  items?: QuoteItem[];
}

export interface CreateQuoteData {
  client_id?: string;
  fecha: string;
  fecha_evento?: string;
  estado?: QuoteStatus;
  subtotal: number;
  descuento?: number;
  total: number;
  notas?: string;
  items: Omit<QuoteItem, 'id' | 'quote_id' | 'subtotal'>[];
}

export type UpdateQuoteData = Partial<Omit<CreateQuoteData, 'items'>>;
