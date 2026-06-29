export interface DecorationOption {
  id: string;
  name: string;
  price_cents: number;
  is_default: boolean;
}

export interface ActivityOption {
  id: string;
  group: 'A' | 'B' | 'C';
  name: string;
  price_per_person: number;
}

export interface PackageCategoryConfig {
  id: string;
  venue_id: string;
  category: 'hula_hula' | 'hooping';
  description: string | null;
  inclusions: string[];
  decorations: DecorationOption[];
  activities: ActivityOption[];
  glam_girls_price_cents: number;
  glam_girls_min_count: number;
  glam_girls_description: string | null;
  glam_girls_inclusions: string[];
  included_activity_groups: string[];
  created_at: string;
  updated_at: string;
}
