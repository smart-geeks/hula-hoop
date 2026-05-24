import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { VenueService } from './venue.service';
import type { Supplier, CreateSupplierData, UpdateSupplierData } from '../interfaces/supplier';

@Injectable({ providedIn: 'root' })
export class SupplierService {
  private readonly supabase = inject(SupabaseService);
  private readonly venue    = inject(VenueService);

  async getAll(includeInactive = false): Promise<Supplier[]> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return [];

    let query = client
      .from('suppliers')
      .select('*')
      .eq('venue_id', venueId)
      .order('nombre', { ascending: true });

    if (!includeInactive) {
      query = query.eq('activo', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching suppliers:', error.message);
      return [];
    }
    return data ?? [];
  }

  async getById(id: string): Promise<Supplier | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching supplier:', error.message);
      return null;
    }
    return data;
  }

  async create(data: CreateSupplierData): Promise<Supplier | null> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return null;

    const { data: created, error } = await client
      .from('suppliers')
      .insert({ ...data, venue_id: venueId })
      .select()
      .single();

    if (error) {
      console.error('Error creating supplier:', error.message);
      return null;
    }
    return created;
  }

  async update(id: string, data: UpdateSupplierData): Promise<Supplier | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: updated, error } = await client
      .from('suppliers')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating supplier:', error.message);
      return null;
    }
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;
    const { error } = await client.from('suppliers').delete().eq('id', id);
    if (error) {
      console.error('Error deleting supplier:', error.message);
      return false;
    }
    return true;
  }

  async toggleActive(id: string, activo: boolean): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client.from('suppliers').update({ activo }).eq('id', id);
    if (error) {
      console.error('Error toggling supplier status:', error.message);
      return false;
    }
    return true;
  }
}
