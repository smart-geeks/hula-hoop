export type ExtraCategory = 'extras' | 'hula_munch_bar' | 'servicios_adicionales';

export interface ExtraVariant {
  id: string;
  name: string;
  price_cents: number;
}

export interface Extra {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  pay_at_venue: boolean;
  is_active: boolean;
  sort_order: number;
  category: ExtraCategory;
  variants?: ExtraVariant[] | null;
  created_at: string;
  updated_at: string;
}

