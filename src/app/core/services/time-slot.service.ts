import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { TimeSlot } from '../interfaces/time-slot';

@Injectable({ providedIn: 'root' })
export class TimeSlotService {
  private readonly supabase = inject(SupabaseService);

  async getActiveSlots(): Promise<TimeSlot[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('time_slots')
      .select('*')
      .eq('is_active', true)
      .order('day_type')
      .order('start_time');

    if (error) {
      console.error('Error fetching time slots:', error.message);
      return [];
    }

    return data as TimeSlot[];
  }

  async getAllSlots(): Promise<TimeSlot[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('time_slots')
      .select('*')
      .order('day_type')
      .order('start_time');

    if (error) {
      console.error('Error fetching time slots:', error.message);
      return [];
    }

    return data as TimeSlot[];
  }

  async createSlot(slot: Pick<TimeSlot, 'day_type' | 'start_time' | 'end_time' | 'is_active'>): Promise<TimeSlot | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('time_slots')
      .insert(slot)
      .select()
      .single();

    if (error) {
      console.error('Error creating time slot:', error.message);
      return null;
    }

    return data as TimeSlot;
  }

  async updateSlot(id: string, changes: Partial<Pick<TimeSlot, 'day_type' | 'start_time' | 'end_time' | 'is_active'>>): Promise<TimeSlot | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('time_slots')
      .update(changes)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating time slot:', error.message);
      return null;
    }

    return data as TimeSlot;
  }

  async deleteSlot(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('time_slots')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting time slot:', error.message);
      return false;
    }

    return true;
  }
}
