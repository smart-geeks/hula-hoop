import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-play-day-section',
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './play-day-section.html',
})
export class PlayDaySection {
  /** Mock available slots — will be dynamic from Supabase in the future. */
  readonly availableSlots = [
    { time: '9:30 AM - 12:30 PM', day: 'Sábado' },
    { time: '3:30 PM - 6:30 PM', day: 'Sábado' },
  ];

  readonly hasAvailability = this.availableSlots.length > 0;

  onReservar(): void {
    console.log('Reservar Entrada clicked');
  }
}
