import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

@Component({
  selector: 'app-schedule-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './schedule-section.html',
})
export class ScheduleSection implements OnInit {
  private readonly timeSlotService = inject(TimeSlotService);

  readonly slots = signal<TimeSlot[]>([]);
  readonly loading = signal(true);

  readonly weekdaySessions = computed(() =>
    this.slots()
      .filter(s => s.day_type === 'weekday')
      .map(s => this.formatRange(s.start_time, s.end_time)),
  );

  readonly weekendSessions = computed(() =>
    this.slots()
      .filter(s => s.day_type === 'weekend')
      .map(s => this.formatRange(s.start_time, s.end_time)),
  );

  ngOnInit(): void {
    this.loadSlots();
  }

  private async loadSlots(): Promise<void> {
    const active = await this.timeSlotService.getActiveSlots();
    this.slots.set(active);
    this.loading.set(false);
  }

  private formatRange(start: string, end: string): string {
    return this.formatTime(start) + ' - ' + this.formatTime(end);
  }

  private formatTime(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`;
  }
}
