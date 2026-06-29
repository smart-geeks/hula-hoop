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
  time_slot_id: string | null;
  mp_preference_id: string | null;
  snack_option_id: string | null;
  package_id: string | null;
  notas: string | null;
  created_at: string;
  // Relations
  client?: { nombre: string; email: string | null; telefono: string | null };
  items?: QuoteItem[];
  snack_option?: { name: string };
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
  time_slot_id?: string;
  snack_option_id?: string;
  package_id?: string;
  notas?: string;
  items: Omit<QuoteItem, 'id' | 'quote_id' | 'subtotal'>[];
}

export type UpdateQuoteData = Partial<Omit<CreateQuoteData, 'items'>>;
