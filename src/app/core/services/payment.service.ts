import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface PaymentPreference {
  init_point: string;
  sandbox_init_point: string;
  preference_id: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly supabase = inject(SupabaseService);

  async createPayment(
    reservationId: string,
    reservationType: 'private' | 'playdate',
  ): Promise<PaymentPreference | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client.functions.invoke('create-payment', {
      body: {
        reservation_id: reservationId,
        reservation_type: reservationType,
      },
    });

    if (error) {
      console.error('Error creating payment:', error.message);
      return null;
    }

    return data as PaymentPreference;
  }

  /** Redirect user to Mercado Pago checkout */
  redirectToCheckout(preference: PaymentPreference): void {
    // Use init_point — sandbox_init_point has redirect loop issues in MP Mexico
    // With test credentials, init_point still works in test mode
    window.location.href = preference.init_point;
  }
}
