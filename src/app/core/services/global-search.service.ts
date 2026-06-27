import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface ReservationResult {
  id: string;
  guest_name: string;
  guest_phone: string;
  reservation_date: string;
  status: string;
}

export interface ContractResult {
  id: string;
  folio: string;
  fecha_evento: string;
  estado: string;
  client: { nombre: string } | null;
}

export interface ClientResult {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
}

export interface SearchResults {
  reservations: ReservationResult[];
  contracts: ContractResult[];
  clients: ClientResult[];
}

@Injectable({ providedIn: 'root' })
export class GlobalSearchService {
  private readonly supabase = inject(SupabaseService);

  async search(query: string): Promise<SearchResults> {
    const client = this.supabase.client;
    if (!client || query.trim().length < 2) {
      return { reservations: [], contracts: [], clients: [] };
    }

    const q = `%${query.trim()}%`;

    const [contracts, clients] = await Promise.all([
      client
        .from('contracts')
        .select('id, folio, fecha_evento, estado, client:clients(nombre)')
        .ilike('folio', q)
        .neq('estado', 'cancelado')
        .order('fecha_evento', { ascending: false })
        .limit(5),
      client
        .from('clients')
        .select('id, nombre, email, telefono')
        .or(`nombre.ilike.${q},email.ilike.${q}`)
        .order('nombre')
        .limit(5),
    ]);

    // Supabase returns joined relations as arrays — normalize to object | null
    const contractRows: ContractResult[] = (contracts.data ?? []).map((c: {
      id: string; folio: string; fecha_evento: string; estado: string;
      client: { nombre: string }[] | { nombre: string } | null;
    }) => ({
      id: c.id,
      folio: c.folio,
      fecha_evento: c.fecha_evento,
      estado: c.estado,
      client: Array.isArray(c.client) ? (c.client[0] ?? null) : c.client,
    }));

    return {
      reservations: [],
      contracts: contractRows,
      clients: (clients.data ?? []) as ClientResult[],
    };
  }
}
