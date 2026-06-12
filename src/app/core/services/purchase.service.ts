import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { VenueService } from './venue.service';
import type {
  Purchase,
  CreatePurchaseData,
  UpdatePurchaseData,
  PurchaseStatus,
} from '../interfaces/purchase';

@Injectable({ providedIn: 'root' })
export class PurchaseService {
  private readonly supabase = inject(SupabaseService);
  private readonly venue    = inject(VenueService);

  async getAll(): Promise<Purchase[]> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return [];

    const { data, error } = await client
      .from('purchases')
      .select(
        '*, supplier:suppliers(nombre), contract:contracts(folio, fecha_evento), items:purchase_items(*)',
      )
      .eq('venue_id', venueId)
      .order('fecha', { ascending: false });

    if (error) {
      console.error('Error fetching purchases:', error.message);
      return [];
    }
    return data ?? [];
  }

  async getById(id: string): Promise<Purchase | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('purchases')
      .select(
        '*, supplier:suppliers(nombre), contract:contracts(folio, fecha_evento), items:purchase_items(*)',
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching purchase:', error.message);
      return null;
    }
    return data;
  }

  async getByContract(contractId: string): Promise<Purchase[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('purchases')
      .select('*, supplier:suppliers(nombre), items:purchase_items(*)')
      .eq('contract_id', contractId)
      .order('fecha', { ascending: false });

    if (error) {
      console.error('Error fetching purchases by contract:', error.message);
      return [];
    }
    return data ?? [];
  }

  async create(data: CreatePurchaseData): Promise<Purchase | null> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return null;

    const folio = await this.generateFolio(venueId);
    const { items, ...purchaseData } = data;

    const { data: created, error } = await client
      .from('purchases')
      .insert({ ...purchaseData, folio, venue_id: venueId })
      .select()
      .single();

    if (error || !created) {
      console.error('Error creating purchase:', error?.message);
      return null;
    }

    if (items.length > 0) {
      const { error: itemsError } = await client.from('purchase_items').insert(
        items.map((item) => ({ ...item, purchase_id: created.id })),
      );
      if (itemsError) console.error('Error creating purchase items:', itemsError.message);
    }

    return this.getById(created.id);
  }

  async update(id: string, data: UpdatePurchaseData): Promise<Purchase | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { error } = await client.from('purchases').update(data).eq('id', id);
    if (error) {
      console.error('Error updating purchase:', error.message);
      return null;
    }
    return this.getById(id);
  }

  async updateStatus(id: string, estado: PurchaseStatus): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client.from('purchases').update({ estado }).eq('id', id);
    if (error) {
      console.error('Error updating purchase status:', error.message);
      return false;
    }
    return true;
  }

  async updateFull(id: string, data: CreatePurchaseData): Promise<Purchase | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { items, ...purchaseData } = data;
    const { error } = await client.from('purchases').update(purchaseData).eq('id', id);
    if (error) {
      console.error('Error updating purchase:', error.message);
      return null;
    }

    await client.from('purchase_items').delete().eq('purchase_id', id);
    if (items.length > 0) {
      await client.from('purchase_items').insert(
        items.map((item) => ({ ...item, purchase_id: id })),
      );
    }
    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;
    const { error } = await client.from('purchases').delete().eq('id', id);
    if (error) {
      console.error('Error deleting purchase:', error.message);
      return false;
    }
    return true;
  }

  private async generateFolio(venueId: string): Promise<string> {
    const year   = new Date().getFullYear();
    const client = this.supabase.client;
    if (!client) return `OC-${year}-001`;

    const { count } = await client
      .from('purchases')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${year}-01-01`);

    return `OC-${year}-${String((count ?? 0) + 1).padStart(3, '0')}`;
  }
}
