export type ContractStatus = 'borrador' | 'firmado' | 'liquidado' | 'cancelado' | 'concluido';

export interface ContractPayment {
  id: string;
  contract_id: string;
  monto: number;
  fecha: string;
  metodo: 'efectivo' | 'tarjeta' | 'transferencia';
  notas: string | null;
  created_at: string;
}

export interface Contract {
  id: string;
  venue_id: string;
  folio: string;
  quote_id: string | null;
  client_id: string | null;
  fecha_firma: string | null;
  fecha_evento: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  salon_renta: number;
  total_contrato: number;
  deposito_pagado: number;
  saldo_pendiente: number;
  estado: ContractStatus;
  pdf_url: string | null;
  ine_url?: string | null;
  comprobante_url?: string | null;
  firma_url?: string | null;
  doc_metadata?: Record<string, { replaced_by: string; replaced_at: string } | null> | null;
  notas: string | null;
  created_at: string;
  // Relations
  client?: { nombre: string; email: string | null; telefono: string | null };
  payments?: ContractPayment[];
}

export interface CreateContractData {
  venue_id?: string;
  quote_id?: string;
  client_id?: string;
  fecha_evento: string;
  hora_inicio?: string;
  hora_fin?: string;
  salon_renta: number;
  total_contrato: number;
  deposito_pagado?: number;
  estado?: ContractStatus;
  pdf_url?: string | null;
  ine_url?: string | null;
  comprobante_url?: string | null;
  firma_url?: string | null;
  fecha_firma?: string | null;
  notas?: string;
}

export type UpdateContractData = Partial<CreateContractData>;
