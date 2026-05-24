import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { VenueService } from './venue.service';
import type { CashierProfile } from '../interfaces/pos';

@Injectable({ providedIn: 'root' })
export class CashierService {
  private readonly supabase = inject(SupabaseService);
  private readonly venue    = inject(VenueService);

  /** Lista de cajeros activos para el PIN picker del POS. */
  async getActive(): Promise<CashierProfile[]> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return [];

    const { data, error } = await client
      .from('cashier_profiles')
      .select('id, venue_id, nombre, activo, created_at, updated_at')
      .eq('venue_id', venueId)
      .eq('activo', true)
      .order('nombre');

    if (error) { console.error('Error fetching cashiers:', error.message); return []; }
    return data ?? [];
  }

  /** Lista completa (activos + inactivos) para la pantalla de administración. */
  async getAll(): Promise<CashierProfile[]> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return [];

    const { data, error } = await client
      .from('cashier_profiles')
      .select('id, venue_id, nombre, activo, created_at, updated_at')
      .eq('venue_id', venueId)
      .order('nombre');

    if (error) { console.error('Error fetching all cashiers:', error.message); return []; }
    return data ?? [];
  }

  /**
   * Crea un cajero con PIN hasheado en Supabase (RPC SECURITY DEFINER).
   * El PIN viaja en texto claro solo en el canal HTTPS y NUNCA se persiste.
   */
  async create(nombre: string, pin: string): Promise<CashierProfile | null> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return null;

    const { data: cashierId, error } = await client
      .rpc('create_cashier', { p_nombre: nombre, p_pin: pin, p_venue_id: venueId });

    if (error || !cashierId) { console.error('Error creating cashier:', error?.message); return null; }

    const { data, error: fetchError } = await client
      .from('cashier_profiles')
      .select('id, venue_id, nombre, activo, created_at, updated_at')
      .eq('id', cashierId)
      .single();

    if (fetchError) { console.error('Error fetching new cashier:', fetchError.message); return null; }
    return data;
  }

  /**
   * Valida el PIN de un cajero.
   * Retorna el CashierProfile si el PIN es correcto, null si no.
   * Toda la lógica de comparación corre en Supabase (SECURITY DEFINER).
   */
  async validatePin(cashierId: string, pin: string): Promise<CashierProfile | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: validatedId, error } = await client
      .rpc('validate_cashier_pin', { p_cashier_id: cashierId, p_pin: pin });

    if (error || !validatedId) return null;

    const { data, error: fetchError } = await client
      .from('cashier_profiles')
      .select('id, venue_id, nombre, activo, created_at, updated_at')
      .eq('id', validatedId)
      .single();

    if (fetchError) return null;
    return data;
  }

  /** Cambia el PIN de un cajero. */
  async updatePin(cashierId: string, newPin: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { data, error } = await client
      .rpc('update_cashier_pin', { p_cashier_id: cashierId, p_new_pin: newPin });

    if (error) { console.error('Error updating PIN:', error.message); return false; }
    return data === true;
  }

  /** Actualiza el nombre de un cajero. */
  async updateNombre(cashierId: string, nombre: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('cashier_profiles')
      .update({ nombre, updated_at: new Date().toISOString() })
      .eq('id', cashierId);

    if (error) { console.error('Error updating cashier name:', error.message); return false; }
    return true;
  }

  /** Activa o desactiva un cajero (nunca se borra para preservar el historial de ventas). */
  async setActivo(cashierId: string, activo: boolean): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('cashier_profiles')
      .update({ activo, updated_at: new Date().toISOString() })
      .eq('id', cashierId);

    if (error) { console.error('Error updating cashier status:', error.message); return false; }
    return true;
  }
}
