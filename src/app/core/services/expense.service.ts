import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { VenueService } from './venue.service';
import type { AdminExpense, CreateExpenseData, UpdateExpenseData } from '../interfaces/expense';

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly supabase = inject(SupabaseService);
  private readonly venue    = inject(VenueService);

  async getAll(filters?: { from?: string; to?: string; categoria?: string }): Promise<AdminExpense[]> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return [];

    let query = client
      .from('admin_expenses')
      .select('*, contract:contracts(folio, fecha_evento), supplier:suppliers(nombre)')
      .eq('venue_id', venueId)
      .order('fecha', { ascending: false });

    if (filters?.from)      query = query.gte('fecha', filters.from);
    if (filters?.to)        query = query.lte('fecha', filters.to);
    if (filters?.categoria) query = query.eq('categoria', filters.categoria);

    const { data, error } = await query;
    if (error) { console.error('Error fetching expenses:', error.message); return []; }
    return data ?? [];
  }

  async getByContract(contractId: string): Promise<AdminExpense[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('admin_expenses')
      .select('*')
      .eq('contract_id', contractId)
      .order('fecha', { ascending: false });

    if (error) { console.error('Error fetching contract expenses:', error.message); return []; }
    return data ?? [];
  }

  async create(data: CreateExpenseData): Promise<AdminExpense | null> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return null;

    const { data: created, error } = await client
      .from('admin_expenses')
      .insert({ ...data, venue_id: venueId })
      .select()
      .single();

    if (error) { console.error('Error creating expense:', error.message); return null; }
    return created;
  }

  async update(id: string, data: UpdateExpenseData): Promise<AdminExpense | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: updated, error } = await client
      .from('admin_expenses')
      .update(data).eq('id', id).select().single();

    if (error) { console.error('Error updating expense:', error.message); return null; }
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;
    const { error } = await client.from('admin_expenses').delete().eq('id', id);
    if (error) { console.error('Error deleting expense:', error.message); return false; }
    return true;
  }

  async getTotalByPeriod(from: string, to: string): Promise<number> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return 0;

    const { data, error } = await client
      .from('admin_expenses')
      .select('monto')
      .eq('venue_id', venueId)
      .gte('fecha', from)
      .lte('fecha', to);

    if (error || !data) return 0;
    return data.reduce((sum, e) => sum + (e.monto ?? 0), 0);
  }
}
