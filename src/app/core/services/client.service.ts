import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Client, CreateClientData, UpdateClientData } from '../interfaces/client';

@Injectable({ providedIn: 'root' })
export class ClientService {
  private readonly supabase = inject(SupabaseService);

  async getAll(): Promise<Client[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('clients')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) {
      console.error('Error fetching clients:', error.message);
      return [];
    }
    return data ?? [];
  }

  async getById(id: string): Promise<Client | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching client:', error.message);
      return null;
    }
    return data;
  }

  async create(data: CreateClientData): Promise<Client | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: created, error } = await client
      .from('clients')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Error creating client:', error.message);
      return null;
    }
    return created;
  }

  async update(id: string, data: UpdateClientData): Promise<Client | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: updated, error } = await client
      .from('clients')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating client:', error.message);
      return null;
    }
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client.from('clients').delete().eq('id', id);

    if (error) {
      console.error('Error deleting client:', error.message);
      return false;
    }
    return true;
  }

  async search(query: string): Promise<Client[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('clients')
      .select('*')
      .or(`nombre.ilike.%${query}%,email.ilike.%${query}%,telefono.ilike.%${query}%`)
      .order('nombre', { ascending: true })
      .limit(20);

    if (error) {
      console.error('Error searching clients:', error.message);
      return [];
    }
    return data ?? [];
  }
}
