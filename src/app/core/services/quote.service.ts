import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { VenueService } from './venue.service';
import type { Quote, CreateQuoteData, UpdateQuoteData, QuoteStatus } from '../interfaces/quote';

@Injectable({ providedIn: 'root' })
export class QuoteService {
  private readonly supabase = inject(SupabaseService);
  private readonly venue    = inject(VenueService);

  async getAll(): Promise<Quote[]> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return [];

    const { data, error } = await client
      .from('quotes')
      .select('*, client:clients(nombre, email, telefono), items:quote_items(*), snack_option:snack_options(name), package:packages(*)')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching quotes:', error.message);
      return [];
    }
    return data ?? [];
  }

  async getById(id: string): Promise<Quote | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('quotes')
      .select('*, client:clients(nombre, email, telefono), items:quote_items(*), snack_option:snack_options(name), package:packages(*)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching quote:', error.message);
      return null;
    }
    return data;
  }

  async create(data: CreateQuoteData): Promise<Quote | null> {
    const client  = this.supabase.client;
    const venueId = data.venue_id ?? this.venue.currentVenueId();
    if (!client || !venueId) return null;

    const folio = await this.generateFolio(venueId);
    const { items, ...quoteData } = data;

    const { data: created, error } = await client
      .from('quotes')
      .insert({ ...quoteData, folio, venue_id: venueId })
      .select()
      .single();

    if (error || !created) {
      console.error('Error creating quote:', error?.message);
      return null;
    }

    if (items.length > 0) {
      const { error: itemsError } = await client.from('quote_items').insert(
        items.map((item) => ({ ...item, quote_id: created.id })),
      );
      if (itemsError) console.error('Error creating quote items:', itemsError.message);
    }

    return this.getById(created.id);
  }

  async update(id: string, data: UpdateQuoteData): Promise<Quote | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { error } = await client.from('quotes').update(data).eq('id', id);

    if (error) {
      console.error('Error updating quote:', error.message);
      return null;
    }
    return this.getById(id);
  }

  async updateFull(id: string, data: CreateQuoteData): Promise<Quote | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { items, ...quoteData } = data;

    const { error } = await client.from('quotes').update(quoteData).eq('id', id);
    if (error) {
      console.error('Error updating quote header:', error.message);
      return null;
    }

    await client.from('quote_items').delete().eq('quote_id', id);

    if (items.length > 0) {
      const { error: itemsError } = await client
        .from('quote_items')
        .insert(items.map((item) => ({ ...item, quote_id: id })));
      if (itemsError) console.error('Error replacing quote items:', itemsError.message);
    }

    return this.getById(id);
  }

  async updateStatus(id: string, estado: QuoteStatus): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client.from('quotes').update({ estado }).eq('id', id);
    if (error) {
      console.error('Error updating quote status:', error.message);
      return false;
    }
    return true;
  }

  async getByPublicToken(token: string): Promise<Quote | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('quotes')
      .select('*, client:clients(nombre, email, telefono), items:quote_items(*), snack_option:snack_options(name), package:packages(*)')
      .eq('public_token', token)
      .single();

    if (error) {
      console.error('Error fetching quote by token:', error.message);
      return null;
    }
    return data;
  }

  async delete(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client.from('quotes').delete().eq('id', id);
    if (error) {
      console.error('Error deleting quote:', error.message);
      return false;
    }
    return true;
  }

  private async generateFolio(venueId: string): Promise<string> {
    const year   = new Date().getFullYear();
    const client = this.supabase.client;
    if (!client) return `QT-${year}-001`;

    const { data } = await client
      .from('quotes')
      .select('folio')
      .like('folio', `QT-${year}-%`)
      .order('folio', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const lastFolio = data[0].folio;
      const parts = lastFolio.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) {
        return `QT-${year}-${String(lastNum + 1).padStart(3, '0')}`;
      }
    }

    return `QT-${year}-001`;
  }
}
