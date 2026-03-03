export interface PartyPackage {
  id: string;
  name: string;
  description: string | null;
  min_guests: number;
  max_guests: number;
  price_cents: number;
  inclusions: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
