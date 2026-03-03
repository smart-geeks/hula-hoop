export interface VenueConfig {
  id: string;
  max_capacity_per_slot: number;
  playdate_ticket_price_cents: number;
  playdate_extra_adult_price_cents: number;
  min_hours_before_private: number;
  private_booking_horizon_date: string | null; // ISO date string
  updated_at: string;
  updated_by: string | null;
}
