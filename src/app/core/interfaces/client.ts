export interface Client {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  rfc: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateClientData {
  nombre: string;
  telefono?: string;
  email?: string;
  rfc?: string;
  notas?: string;
}

export type UpdateClientData = Partial<CreateClientData>;
