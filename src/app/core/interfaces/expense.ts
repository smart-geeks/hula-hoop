export interface AdminExpense {
  id: string;
  venue_id: string;
  categoria: string;
  descripcion: string;
  monto: number;
  fecha: string;
  comprobante_url: string | null;
  contract_id: string | null;
  supplier_id: string | null;
  created_at: string;
  // Relations
  contract?: { folio: string; fecha_evento: string };
  supplier?: { nombre: string };
}

export interface CreateExpenseData {
  venue_id?: string;
  categoria: string;
  descripcion: string;
  monto: number;
  fecha: string;
  comprobante_url?: string;
  contract_id?: string;
  supplier_id?: string;
}

export type UpdateExpenseData = Partial<CreateExpenseData>;

export const EXPENSE_CATEGORIES = [
  'Nómina',
  'Renta local',
  'Servicios (luz/agua/internet)',
  'Mantenimiento',
  'Marketing y publicidad',
  'Seguros',
  'Impuestos',
  'Papelería y oficina',
  'Transporte',
  'Capacitación',
  'Otro',
] as const;
