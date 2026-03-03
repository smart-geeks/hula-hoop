export interface TimeSlot {
  id: string;
  day_type: 'weekday' | 'weekend';
  start_time: string; // HH:MM format, local Mexico time
  end_time: string;
  is_active: boolean;
  created_at: string;
}
