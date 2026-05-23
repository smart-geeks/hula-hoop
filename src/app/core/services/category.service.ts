import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Category, CategoryTipo } from '../interfaces/category';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly supabase = inject(SupabaseService);

  async getByTipo(tipo: CategoryTipo): Promise<Category[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('categories')
      .select('*')
      .eq('tipo', tipo)
      .eq('activo', true)
      .order('orden');

    if (error) {
      console.error('Error fetching categories:', error.message);
      return [];
    }
    return data ?? [];
  }

  async getAll(): Promise<Category[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('categories')
      .select('*')
      .order('tipo')
      .order('orden');

    if (error) {
      console.error('Error fetching all categories:', error.message);
      return [];
    }
    return data ?? [];
  }

  async create(payload: Omit<Category, 'id' | 'created_at'>): Promise<Category | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('categories')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error creating category:', error.message);
      return null;
    }
    return data;
  }

  async update(id: string, payload: Partial<Pick<Category, 'nombre' | 'color' | 'icono' | 'orden'>>): Promise<Category | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('categories')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating category:', error.message);
      return null;
    }
    return data;
  }

  async setActivo(id: string, activo: boolean): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('categories')
      .update({ activo })
      .eq('id', id);

    if (error) {
      console.error('Error toggling category:', error.message);
      return false;
    }
    return true;
  }
}
