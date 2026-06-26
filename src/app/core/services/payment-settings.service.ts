import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { VenueService } from './venue.service';
import { environment } from '../../../environments/environment';
import type { MaskedPaymentSettings, MpMode, PaymentSettings, PaymentSettingsUpdate } from '../interfaces/payment-settings';

@Injectable({ providedIn: 'root' })
export class PaymentSettingsService {
  private readonly supabase = inject(SupabaseService);
  private readonly venue    = inject(VenueService);

  readonly webhookUrl = `${environment.supabaseUrl}/functions/v1/mp-webhook`;

  async getSettings(): Promise<MaskedPaymentSettings | null> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return null;

    const { data, error } = await client
      .from('payment_settings')
      .select('*')
      .eq('venue_id', venueId)
      .single();

    if (error) {
      console.error('Error fetching payment settings:', error.message);
      return null;
    }

    const d = data as PaymentSettings;
    return {
      id:         d.id,
      venue_id:   d.venue_id,
      mp_mode:    d.mp_mode,
      mp_sandbox_access_token_masked:   this.maskToken(d.mp_sandbox_access_token),
      mp_sandbox_webhook_secret_masked: this.maskToken(d.mp_sandbox_webhook_secret),
      mp_prod_access_token_masked:      this.maskToken(d.mp_prod_access_token),
      mp_prod_webhook_secret_masked:    this.maskToken(d.mp_prod_webhook_secret),
      updated_at: d.updated_at,
      updated_by: d.updated_by,
    };
  }

  async saveMode(id: string, mode: MpMode, updatedBy: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('payment_settings')
      .update({ mp_mode: mode, updated_by: updatedBy, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error saving mode:', error.message);
      return false;
    }
    return true;
  }

  async saveCredentials(id: string, changes: PaymentSettingsUpdate): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('payment_settings')
      .update(changes)
      .eq('id', id);

    if (error) {
      console.error('Error saving credentials:', error.message);
      return false;
    }
    return true;
  }

  generateSecret(): string {
    return crypto.randomUUID();
  }

  private maskToken(value: string | null): string | null {
    if (!value) return null;
    if (value.length <= 4) return '••••';
    return '•'.repeat(Math.min(value.length - 4, 20)) + value.slice(-4);
  }
}
