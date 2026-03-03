import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type {
  PrivateReservation,
  PlaydateReservation,
  CreatePrivateReservationData,
  CreatePlaydateReservationData,
  ReservationStatus,
} from '../interfaces/reservation';

@Injectable({ providedIn: 'root' })
export class ReservationService {
  private readonly supabase = inject(SupabaseService);

  // ── Private Reservations ──────────────────────────────────

  async createPrivateReservation(data: CreatePrivateReservationData): Promise<PrivateReservation | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { extras, ...reservationData } = data;

    // Insert the reservation
    const { data: reservation, error } = await client
      .from('private_reservations')
      .insert(reservationData)
      .select()
      .single();

    if (error || !reservation) {
      console.error('Error creating private reservation:', error?.message);
      return null;
    }

    // Insert extras if any
    if (extras.length > 0) {
      const extrasToInsert = extras.map((e) => ({
        reservation_id: reservation.id,
        extra_id: e.extra_id,
        quantity: e.quantity,
        unit_price_cents: e.unit_price_cents,
      }));

      const { error: extrasError } = await client
        .from('private_reservation_extras')
        .insert(extrasToInsert);

      if (extrasError) {
        console.error('Error inserting reservation extras:', extrasError.message);
      }
    }

    return reservation as PrivateReservation;
  }

  async getPrivateReservationByToken(accessToken: string): Promise<PrivateReservation | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('private_reservations')
      .select('*')
      .eq('access_token', accessToken)
      .single();

    if (error) {
      console.error('Error fetching private reservation:', error.message);
      return null;
    }

    return data as PrivateReservation;
  }

  async getPrivateReservationsByProfile(profileId: string): Promise<PrivateReservation[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('private_reservations')
      .select('*')
      .eq('profile_id', profileId)
      .order('reservation_date', { ascending: false });

    if (error) {
      console.error('Error fetching private reservations:', error.message);
      return [];
    }

    return data as PrivateReservation[];
  }

  async getAllPrivateReservations(): Promise<PrivateReservation[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('private_reservations')
      .select('*')
      .order('reservation_date', { ascending: false });

    if (error) {
      console.error('Error fetching all private reservations:', error.message);
      return [];
    }

    return data as PrivateReservation[];
  }

  async updatePrivateReservationStatus(id: string, status: ReservationStatus): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('private_reservations')
      .update({ status })
      .eq('id', id);

    if (error) {
      console.error('Error updating private reservation status:', error.message);
      return false;
    }

    return true;
  }

  // ── Playdate Reservations ─────────────────────────────────

  async createPlaydateReservation(data: CreatePlaydateReservationData): Promise<PlaydateReservation | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: reservation, error } = await client
      .from('playdate_reservations')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Error creating playdate reservation:', error?.message);
      return null;
    }

    return reservation as PlaydateReservation;
  }

  async getPlaydateReservationByToken(accessToken: string): Promise<PlaydateReservation | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('playdate_reservations')
      .select('*')
      .eq('access_token', accessToken)
      .single();

    if (error) {
      console.error('Error fetching playdate reservation:', error.message);
      return null;
    }

    return data as PlaydateReservation;
  }

  async getPlaydateReservationsByProfile(profileId: string): Promise<PlaydateReservation[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('playdate_reservations')
      .select('*')
      .eq('profile_id', profileId)
      .order('reservation_date', { ascending: false });

    if (error) {
      console.error('Error fetching playdate reservations:', error.message);
      return [];
    }

    return data as PlaydateReservation[];
  }

  async getAllPlaydateReservations(): Promise<PlaydateReservation[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('playdate_reservations')
      .select('*')
      .order('reservation_date', { ascending: false });

    if (error) {
      console.error('Error fetching all playdate reservations:', error.message);
      return [];
    }

    return data as PlaydateReservation[];
  }

  async updatePlaydateReservationStatus(id: string, status: ReservationStatus): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('playdate_reservations')
      .update({ status })
      .eq('id', id);

    if (error) {
      console.error('Error updating playdate reservation status:', error.message);
      return false;
    }

    return true;
  }

  // ── Availability ──────────────────────────────────────────

  /** Check if a slot has a confirmed private reservation for a given date */
  async isSlotBlockedByPrivate(date: string, timeSlotId: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { count, error } = await client
      .from('private_reservations')
      .select('*', { count: 'exact', head: true })
      .eq('reservation_date', date)
      .eq('time_slot_id', timeSlotId)
      .in('status', ['confirmed', 'pending_payment']);

    if (error) {
      console.error('Error checking slot availability:', error.message);
      return true; // Assume blocked on error
    }

    return (count ?? 0) > 0;
  }

  /** Get remaining capacity for play day on a given date + slot */
  async getPlaydateAvailability(date: string, timeSlotId: string, maxCapacity: number): Promise<number> {
    const client = this.supabase.client;
    if (!client) return 0;

    // First check if blocked by private
    const blocked = await this.isSlotBlockedByPrivate(date, timeSlotId);
    if (blocked) return 0;

    const { data, error } = await client
      .from('playdate_reservations')
      .select('kids_count, adults_count, extra_adults_count')
      .eq('reservation_date', date)
      .eq('time_slot_id', timeSlotId)
      .in('status', ['confirmed', 'pending_payment']);

    if (error) {
      console.error('Error checking playdate availability:', error.message);
      return 0;
    }

    const occupied = (data ?? []).reduce(
      (sum, r) => sum + r.kids_count + r.adults_count + r.extra_adults_count,
      0,
    );

    return Math.max(0, maxCapacity - occupied);
  }
}
