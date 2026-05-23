import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { PosSession, PosSale, CreateSaleData } from '../interfaces/pos';

@Injectable({ providedIn: 'root' })
export class PosService {
  private readonly supabase = inject(SupabaseService);

  async openSession(contractId?: string, cashierId?: string): Promise<PosSession | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('pos_sessions')
      .insert({ contract_id: contractId ?? null, cashier_id: cashierId ?? null })
      .select('*, contract:contracts(folio, fecha_evento), cashier:cashier_profiles(nombre)')
      .single();

    if (error) {
      console.error('Error opening POS session:', error.message);
      return null;
    }
    return data;
  }

  async closeSession(sessionId: string, totalVentas: number): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('pos_sessions')
      .update({ closed_at: new Date().toISOString(), total_ventas: totalVentas })
      .eq('id', sessionId);

    if (error) {
      console.error('Error closing POS session:', error.message);
      return false;
    }
    return true;
  }

  async getActiveSessions(): Promise<PosSession[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('pos_sessions')
      .select('*, contract:contracts(folio, fecha_evento), cashier:cashier_profiles(nombre)')
      .is('closed_at', null)
      .order('opened_at', { ascending: false });

    if (error) {
      console.error('Error fetching active sessions:', error.message);
      return [];
    }
    return data ?? [];
  }

  async registerSale(data: CreateSaleData): Promise<PosSale | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const folio = `VTA-${Date.now()}`;
    const { items, ...saleData } = data;

    const { data: sale, error } = await client
      .from('pos_sales')
      .insert({ ...saleData, folio })
      .select('*, cashier:cashier_profiles(nombre)')
      .single();

    if (error || !sale) {
      console.error('Error registering sale:', error?.message);
      return null;
    }

    if (items.length > 0) {
      await client.from('pos_sale_items').insert(
        items.map((item) => ({ ...item, sale_id: sale.id })),
      );
    }

    return sale;
  }

  async getSalesBySession(sessionId: string): Promise<PosSale[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('pos_sales')
      .select('*, cashier:cashier_profiles(nombre), items:pos_sale_items(*, item:inventory_items(nombre, sku))')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching sales:', error.message);
      return [];
    }
    return data ?? [];
  }
}
