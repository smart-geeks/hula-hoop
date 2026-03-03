import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { VenueConfig } from '../interfaces/venue-config';

@Injectable({ providedIn: 'root' })
export class VenueConfigService {
  private readonly supabase = inject(SupabaseService);

  async getConfig(): Promise<VenueConfig | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('venue_config')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching venue config:', error.message);
      return null;
    }

    return data as VenueConfig;
  }

  async updateConfig(
    id: string,
    changes: Partial<Pick<VenueConfig,
      | 'max_capacity_per_slot'
      | 'playdate_ticket_price_cents'
      | 'playdate_extra_adult_price_cents'
      | 'min_hours_before_private'
      | 'private_booking_horizon_date'
    >> & { updated_by: string },
  ): Promise<VenueConfig | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('venue_config')
      .update(changes)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating venue config:', error.message);
      return null;
    }

    return data as VenueConfig;
  }
}
