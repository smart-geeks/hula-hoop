import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { PartyPackage } from '../interfaces/package';

@Injectable({ providedIn: 'root' })
export class PackageService {
  private readonly supabase = inject(SupabaseService);

  async getActivePackages(): Promise<PartyPackage[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('packages')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');

    if (error) {
      console.error('Error fetching packages:', error.message);
      return [];
    }

    return data as PartyPackage[];
  }

  async getAllPackages(): Promise<PartyPackage[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('packages')
      .select('*')
      .order('sort_order')
      .order('name');

    if (error) {
      console.error('Error fetching packages:', error.message);
      return [];
    }

    return data as PartyPackage[];
  }

  async createPackage(pkg: Omit<PartyPackage, 'id' | 'created_at' | 'updated_at'>): Promise<PartyPackage | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('packages')
      .insert(pkg)
      .select()
      .single();

    if (error) {
      console.error('Error creating package:', error.message);
      return null;
    }

    return data as PartyPackage;
  }

  async updatePackage(id: string, changes: Partial<Omit<PartyPackage, 'id' | 'created_at' | 'updated_at'>>): Promise<PartyPackage | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('packages')
      .update(changes)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating package:', error.message);
      return null;
    }

    return data as PartyPackage;
  }

  async deletePackage(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('packages')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting package:', error.message);
      return false;
    }

    return true;
  }
}
