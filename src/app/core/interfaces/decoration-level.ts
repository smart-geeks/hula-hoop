export interface DecorationLevel {
  id: string;
  venue_id: string;
  name: string;
  image_url: string | null;
  base_price_cents: number;
  inclusions: string[];
  notes: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
