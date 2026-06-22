import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type {
  PrivateReservation,
  PlaydateReservation,
  CreatePlaydateReservationData,
  ReservationStatus,
} from '../interfaces/reservation';
import type { TimeSlot } from '../interfaces/time-slot';

export interface AvailablePlaydateSlot {
  date: string;       // YYYY-MM-DD
  dayLabel: string;   // "Hoy viernes", "Mañana sábado"
  slot: TimeSlot;
  remaining: number;
}

@Injectable({ providedIn: 'root' })
export class ReservationService {
  private readonly supabase = inject(SupabaseService);

  // ── Private Reservations ──────────────────────────────────

  async getPrivateReservationsByProfile(_profileId: string): Promise<PrivateReservation[]> {
    return []; // private_reservations table removed
  }

  async getAllPrivateReservations(): Promise<PrivateReservation[]> {
    return []; // private_reservations table removed
  }

  async updatePrivateReservationStatus(_id: string, _status: ReservationStatus): Promise<boolean> {
    return false; // private_reservations table removed
  }

  async updatePrivateReservationPaidAmount(_id: string, _paid_deposit_cents: number, _status: ReservationStatus): Promise<boolean> {
    return false; // private_reservations table removed
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

    if (error || !reservation) {
      console.error('Error creating playdate reservation:', error?.message);
      throw new Error(error?.message || 'Error desconocido al insertar en la base de datos');
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

  async updatePlaydateReservationPaidAmount(id: string, paid_deposit_cents: number, status: ReservationStatus): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('playdate_reservations')
      .update({ paid_deposit_cents, status })
      .eq('id', id);

    if (error) {
      console.error('Error updating playdate reservation payment:', error.message);
      return false;
    }

    return true;
  }

  // ── Reservation Extras ───────────────────────────────────

  async getPrivateReservationExtras(_reservationId: string): Promise<{ name: string; quantity: number; unit_price_cents: number; pay_at_venue: boolean }[]> {
    return []; // private_reservation_extras table removed
  }

  // ── Snack Option Name ─────────────────────────────────────

  async getSnackOptionName(snackOptionId: string): Promise<string | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('snack_options')
      .select('name')
      .eq('id', snackOptionId)
      .single();

    if (error) {
      console.error('Error fetching snack option:', error.message);
      return null;
    }

    return data?.name ?? null;
  }

  // ── Availability ──────────────────────────────────────────

  /** Check if a slot has a PAID (confirmed) private reservation for a given date */
  async isSlotBlockedByPrivate(_date: string, _timeSlotId: string): Promise<boolean> {
    return false; // private_reservations table removed
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

  // ── Play Day availability (< 24h rule) ──────────────────

  /**
   * Returns time slots available for play day (public).
   * A slot is available when:
   *  1. It starts in the FUTURE (hasn't begun yet)
   *  2. It starts in LESS than 24 hours from now
   *  3. No private reservation exists for that date + slot
   *  4. There is remaining capacity
   *
   * @param activeSlots  All active time slots from DB
   * @param maxCapacity  Max persons per slot from venue config
   */
  async getAvailablePlaydateSlots(
    activeSlots: TimeSlot[],
    maxCapacity: number,
  ): Promise<AvailablePlaydateSlot[]> {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h

    // We only need to check today and tomorrow (calendar days)
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const daysToCheck = [today, tomorrow];
    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

    const available: AvailablePlaydateSlot[] = [];

    for (const checkDate of daysToCheck) {
      const dayOfWeek = checkDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dayType = isWeekend ? 'weekend' : 'weekday';
      const dateStr = this.formatDateISO(checkDate);

      const isToday = checkDate.getTime() === today.getTime();
      const dayLabel = isToday
        ? `Hoy ${dayNames[dayOfWeek]}`
        : `Mañana ${dayNames[dayOfWeek]}`;

      const slotsForDay = activeSlots.filter(s => s.day_type === dayType);

      for (const slot of slotsForDay) {
        // Build the actual datetime this slot starts
        const [h, m] = slot.start_time.split(':').map(Number);
        const slotStart = new Date(checkDate);
        slotStart.setHours(h, m, 0, 0);

        // Rule 1: must be in the future
        if (slotStart <= now) continue;
        // Rule 2: must start within 24h
        if (slotStart > cutoff) continue;

        // Rule 3 + 4: not blocked by private AND has capacity
        const remaining = await this.getPlaydateAvailability(dateStr, slot.id, maxCapacity);
        if (remaining > 0) {
          available.push({ date: dateStr, dayLabel, slot, remaining });
        }
      }
    }

    return available;
  }

  private formatDateISO(date: Date): string {
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
}
