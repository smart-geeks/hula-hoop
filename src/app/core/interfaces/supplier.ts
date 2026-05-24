export interface Supplier {
  id: string;
  venue_id: string;
  nombre: string;
  categoria: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string;
}

export interface CreateSupplierData {
  venue_id?: string;
  nombre: string;
  categoria?: string;
  contacto?: string;
  telefono?: string;
  email?: string;
  notas?: string;
  activo?: boolean;
}

export type UpdateSupplierData = Partial<CreateSupplierData>;

export const SUPPLIER_CATEGORIES = [
  'Catering',
  'Decoración',
  'Audio y Video',
  'Fotografía',
  'Entretenimiento',
  'Mobiliario',
  'Limpieza',
  'Seguridad',
  'Flores',
  'Pasteles',
  'Otro',
] as const;
