import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type {
  InventoryItem,
  InventoryMovement,
  CreateInventoryItemData,
  CreateMovementData,
  UpdateInventoryItemData,
} from '../interfaces/inventory';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly supabase = inject(SupabaseService);

  async getAll(includeInactive = false): Promise<InventoryItem[]> {
    const client = this.supabase.client;
    if (!client) return [];

    let query = client
      .from('inventory_items')
      .select('*')
      .order('nombre', { ascending: true });

    if (!includeInactive) {
      query = query.eq('activo', true);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching inventory:', error.message);
      return [];
    }
    return data ?? [];
  }

  async getLowStock(): Promise<InventoryItem[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('inventory_items')
      .select('*')
      .filter('stock_actual', 'lte', 'stock_minimo')
      .eq('activo', true);

    if (error) {
      console.error('Error fetching low stock items:', error.message);
      return [];
    }
    return data ?? [];
  }

  async getById(id: string): Promise<InventoryItem | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('inventory_items')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching inventory item:', error.message);
      return null;
    }
    return data;
  }

  async create(data: CreateInventoryItemData): Promise<InventoryItem | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: created, error } = await client
      .from('inventory_items')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Error creating inventory item:', error.message);
      return null;
    }
    return created;
  }

  async update(id: string, data: UpdateInventoryItemData): Promise<InventoryItem | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: updated, error } = await client
      .from('inventory_items')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating inventory item:', error.message);
      return null;
    }
    return updated;
  }

  async registerMovement(data: CreateMovementData): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client.from('inventory_movements').insert(data);

    if (error) {
      console.error('Error registering movement:', error.message);
      return false;
    }
    return true;
  }

  async getMovements(itemId: string): Promise<InventoryMovement[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('inventory_movements')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching movements:', error.message);
      return [];
    }
    return data ?? [];
  }
}
