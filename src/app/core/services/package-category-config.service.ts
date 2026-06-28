import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { PackageCategoryConfig } from '../interfaces/package-category-config';

@Injectable({ providedIn: 'root' })
export class PackageCategoryConfigService {
  private readonly supabase = inject(SupabaseService);

  async getConfigsByVenue(venueId: string): Promise<PackageCategoryConfig[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('package_category_configs')
      .select('*')
      .eq('venue_id', venueId);

    if (error) {
      console.error('Error fetching package category configs by venue:', error.message);
      return [];
    }

    return data as PackageCategoryConfig[];
  }

  async getCategoryConfig(venueId: string, category: 'hula_hula' | 'hooping'): Promise<PackageCategoryConfig | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('package_category_configs')
      .select('*')
      .eq('venue_id', venueId)
      .eq('category', category)
      .maybeSingle();

    if (error) {
      console.error('Error fetching package category config:', error.message);
      return null;
    }

    return data as PackageCategoryConfig | null;
  }

  async updateConfig(id: string, changes: Partial<Omit<PackageCategoryConfig, 'id' | 'venue_id' | 'category' | 'created_at' | 'updated_at'>>): Promise<PackageCategoryConfig | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('package_category_configs')
      .update(changes)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating package category config:', error.message);
      return null;
    }

    return data as PackageCategoryConfig;
  }
}
