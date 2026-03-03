import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

@Component({
  selector: 'app-play-day-section',
  imports: [ButtonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './play-day-section.html',
})
export class PlayDaySection implements OnInit {
  private readonly timeSlotService = inject(TimeSlotService);

  readonly slots = signal<TimeSlot[]>([]);
  readonly loading = signal(true);

  readonly displaySlots = computed(() => {
    return this.slots().map(slot => ({
      day: slot.day_type === 'weekday' ? 'Lun - Vie' : 'Sáb - Dom',
      time: this.formatTime(slot.start_time) + ' - ' + this.formatTime(slot.end_time),
    }));
  });

  readonly hasAvailability = computed(() => this.slots().length > 0);

  ngOnInit(): void {
    this.loadSlots();
  }

  private async loadSlots(): Promise<void> {
    const active = await this.timeSlotService.getActiveSlots();
    this.slots.set(active);
    this.loading.set(false);
  }

  private formatTime(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`;
  }
}
