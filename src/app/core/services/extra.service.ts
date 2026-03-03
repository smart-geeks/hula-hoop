import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Extra } from '../interfaces/extra';

@Injectable({ providedIn: 'root' })
export class ExtraService {
  private readonly supabase = inject(SupabaseService);

  async getActiveExtras(): Promise<Extra[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('extras')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');

    if (error) {
      console.error('Error fetching extras:', error.message);
      return [];
    }

    return data as Extra[];
  }

  async getAllExtras(): Promise<Extra[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('extras')
      .select('*')
      .order('sort_order')
      .order('name');

    if (error) {
      console.error('Error fetching extras:', error.message);
      return [];
    }

    return data as Extra[];
  }

  async createExtra(extra: Omit<Extra, 'id' | 'created_at' | 'updated_at'>): Promise<Extra | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('extras')
      .insert(extra)
      .select()
      .single();

    if (error) {
      console.error('Error creating extra:', error.message);
      return null;
    }

    return data as Extra;
  }

  async updateExtra(id: string, changes: Partial<Omit<Extra, 'id' | 'created_at' | 'updated_at'>>): Promise<Extra | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('extras')
      .update(changes)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating extra:', error.message);
      return null;
    }

    return data as Extra;
  }

  async deleteExtra(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('extras')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting extra:', error.message);
      return false;
    }

    return true;
  }
}
