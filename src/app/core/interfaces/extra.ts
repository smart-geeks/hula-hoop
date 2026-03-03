export interface Extra {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
