import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { SnackOption } from '../interfaces/snack-option';

@Injectable({ providedIn: 'root' })
export class SnackOptionService {
  private readonly supabase = inject(SupabaseService);

  async getActiveSnackOptions(): Promise<SnackOption[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('snack_options')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');

    if (error) {
      console.error('Error fetching snack options:', error.message);
      return [];
    }

    return data as SnackOption[];
  }

  async getAllSnackOptions(): Promise<SnackOption[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('snack_options')
      .select('*')
      .order('sort_order')
      .order('name');

    if (error) {
      console.error('Error fetching snack options:', error.message);
      return [];
    }

    return data as SnackOption[];
  }

  async createSnackOption(option: Omit<SnackOption, 'id' | 'created_at' | 'updated_at'>): Promise<SnackOption | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('snack_options')
      .insert(option)
      .select()
      .single();

    if (error) {
      console.error('Error creating snack option:', error.message);
      return null;
    }

    return data as SnackOption;
  }

  async updateSnackOption(id: string, changes: Partial<Omit<SnackOption, 'id' | 'created_at' | 'updated_at'>>): Promise<SnackOption | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('snack_options')
      .update(changes)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating snack option:', error.message);
      return null;
    }

    return data as SnackOption;
  }

  async deleteSnackOption(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('snack_options')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting snack option:', error.message);
      return false;
    }

    return true;
  }
}
