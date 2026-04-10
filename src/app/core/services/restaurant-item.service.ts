import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { RestaurantItem } from '../interfaces/restaurant-item';

@Injectable({ providedIn: 'root' })
export class RestaurantItemService {
  private readonly supabase = inject(SupabaseService);

  async getActiveItems(): Promise<RestaurantItem[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('restaurant_items')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');

    if (error) {
      console.error('Error fetching restaurant items:', error.message);
      return [];
    }

    return data as RestaurantItem[];
  }

  async getAllItems(): Promise<RestaurantItem[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('restaurant_items')
      .select('*')
      .order('category')
      .order('sort_order')
      .order('name');

    if (error) {
      console.error('Error fetching restaurant items:', error.message);
      return [];
    }

    return data as RestaurantItem[];
  }

  async createItem(item: Omit<RestaurantItem, 'id' | 'created_at' | 'updated_at'>): Promise<RestaurantItem | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('restaurant_items')
      .insert(item)
      .select()
      .single();

    if (error) {
      console.error('Error creating restaurant item:', error.message);
      return null;
    }

    return data as RestaurantItem;
  }

  async updateItem(id: string, changes: Partial<Omit<RestaurantItem, 'id' | 'created_at' | 'updated_at'>>): Promise<RestaurantItem | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('restaurant_items')
      .update(changes)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating restaurant item:', error.message);
      return null;
    }

    return data as RestaurantItem;
  }

  async deleteItem(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('restaurant_items')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting restaurant item:', error.message);
      return false;
    }

    return true;
  }
}
