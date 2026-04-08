export type ReservationStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'expired';

export interface PrivateReservation {
  id: string;
  profile_id: string | null;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  reservation_date: string; // ISO date
  time_slot_id: string;
  package_id: string;
  guest_count: number;
  subtotal_cents: number;
  total_cents: number;
  deposit_cents: number;
  status: ReservationStatus;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  access_token: string;
  notes: string | null;
  snack_option_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrivateReservationExtra {
  id: string;
  reservation_id: string;
  extra_id: string;
  quantity: number;
  unit_price_cents: number;
}

export interface PlaydateReservation {
  id: string;
  profile_id: string | null;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  reservation_date: string;
  time_slot_id: string;
  kids_count: number;
  adults_count: number;
  extra_adults_count: number;
  total_cents: number;
  status: ReservationStatus;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  access_token: string;
  created_at: string;
  updated_at: string;
}

/** Data needed to create a private reservation */
export interface CreatePrivateReservationData {
  profile_id?: string | null;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  reservation_date: string;
  time_slot_id: string;
  package_id: string;
  guest_count: number;
  subtotal_cents: number;
  total_cents: number;
  deposit_cents: number;
  notes?: string;
  snack_option_id?: string;
  extras: { extra_id: string; quantity: number; unit_price_cents: number }[];
}

/** Data needed to create a playdate reservation */
export interface CreatePlaydateReservationData {
  profile_id?: string | null;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  reservation_date: string;
  time_slot_id: string;
  kids_count: number;
  adults_count: number;
  extra_adults_count: number;
  total_cents: number;
}
