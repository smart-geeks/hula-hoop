import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { DecorationLevel } from '../interfaces/decoration-level';

@Injectable({ providedIn: 'root' })
export class DecorationLevelService {
  private readonly supabase = inject(SupabaseService);

  async getActiveByVenue(venueId: string): Promise<DecorationLevel[]> {
    const client = this.supabase.client;
    if (!client) return [];
    const { data, error } = await client
      .from('decoration_levels')
      .select('*')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      console.error('Error fetching decoration levels:', error.message);
      return [];
    }
    return data as DecorationLevel[];
  }

  async getAllByVenue(venueId: string): Promise<DecorationLevel[]> {
    const client = this.supabase.client;
    if (!client) return [];
    const { data, error } = await client
      .from('decoration_levels')
      .select('*')
      .eq('venue_id', venueId)
      .order('sort_order', { ascending: true });
    if (error) {
      console.error('Error fetching all decoration levels:', error.message);
      return [];
    }
    return data as DecorationLevel[];
  }

  async create(
    data: Omit<DecorationLevel, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<DecorationLevel | null> {
    const client = this.supabase.client;
    if (!client) return null;
    const { data: result, error } = await client
      .from('decoration_levels')
      .insert(data)
      .select()
      .single();
    if (error) {
      console.error('Error creating decoration level:', error.message);
      return null;
    }
    return result as DecorationLevel;
  }

  async update(
    id: string,
    changes: Partial<
      Omit<DecorationLevel, 'id' | 'venue_id' | 'created_at' | 'updated_at'>
    >,
  ): Promise<DecorationLevel | null> {
    const client = this.supabase.client;
    if (!client) return null;
    const { data, error } = await client
      .from('decoration_levels')
      .update(changes)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Error updating decoration level:', error.message);
      return null;
    }
    return data as DecorationLevel;
  }

  async remove(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;
    const { error } = await client
      .from('decoration_levels')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Error deleting decoration level:', error.message);
      return false;
    }
    return true;
  }

  async uploadImage(
    file: File,
    venueId: string,
    levelId: string,
  ): Promise<string | null> {
    const client = this.supabase.client;
    if (!client) return null;
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${venueId}/${levelId}.${ext}`;
    const { error } = await client.storage
      .from('decoration-packages')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      console.error('Error uploading decoration image:', error.message);
      return null;
    }
    const { data } = client.storage.from('decoration-packages').getPublicUrl(path);
    return data.publicUrl;
  }
}
