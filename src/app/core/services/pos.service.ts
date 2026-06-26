import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { VenueService } from './venue.service';
import type { PosSession, PosSale, CreateSaleData } from '../interfaces/pos';

@Injectable({ providedIn: 'root' })
export class PosService {
  private readonly supabase = inject(SupabaseService);
  private readonly venue    = inject(VenueService);

  async openSession(contractId?: string, cashierId?: string, openingCash?: number): Promise<PosSession | null> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return null;

    const { data, error } = await client
      .from('pos_sessions')
      .insert({
        contract_id: contractId ?? null,
        cashier_id: cashierId ?? null,
        venue_id: venueId,
        opening_cash: openingCash ?? 0,
      })
      .select('*, contract:contracts(folio, fecha_evento), cashier:cashier_profiles(nombre)')
      .single();

    if (error) {
      console.error('Error opening POS session:', error.message);
      return null;
    }
    return data;
  }

  async closeSession(params: {
    sessionId: string;
    totalVentas: number;
    openingCash: number;
    expectedCash: number;
    declaredCash: number;
    expectedCard: number;
    declaredCard: number;
    expectedTransfer: number;
    declaredTransfer: number;
    cashDifference: number;
    notes?: string;
    closedBy?: string;
  }): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('pos_sessions')
      .update({
        closed_at: new Date().toISOString(),
        total_ventas: params.totalVentas,
        opening_cash: params.openingCash,
        expected_cash: params.expectedCash,
        declared_cash: params.declaredCash,
        expected_card: params.expectedCard,
        declared_card: params.declaredCard,
        expected_transfer: params.expectedTransfer,
        declared_transfer: params.declaredTransfer,
        cash_difference: params.cashDifference,
        notes: params.notes ?? null,
        closed_by: params.closedBy ?? null,
      })
      .eq('id', params.sessionId);

    if (error) {
      console.error('Error closing POS session:', error.message);
      return false;
    }
    return true;
  }

  async getActiveSessions(): Promise<PosSession[]> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return [];

    const { data, error } = await client
      .from('pos_sessions')
      .select('*, contract:contracts(folio, fecha_evento), cashier:cashier_profiles(nombre)')
      .eq('venue_id', venueId)
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
      .select('*, cashier:cashier_profiles(nombre), items:pos_sale_items(*, item:inventory_items(nombre, sku), restaurant_item:restaurant_items(name), extra:extras(name))')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching sales:', error.message);
      return [];
    }
    return data ?? [];
  }
}
