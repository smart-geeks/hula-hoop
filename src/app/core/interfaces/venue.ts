export interface Venue {
  id: string;
  nombre: string;
  slug: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  logo_url?: string;
  activo: boolean;
  created_at: string;
}

export interface VenueUser {
  venue_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'staff' | 'readonly';
  created_at: string;
}

export interface CreateVenueData {
  nombre: string;
  slug: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  logo_url?: string;
}

export type UpdateVenueData = Partial<CreateVenueData> & { activo?: boolean };
