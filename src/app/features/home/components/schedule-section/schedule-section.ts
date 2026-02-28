import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-schedule-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './schedule-section.html',
})
export class ScheduleSection {
  readonly weekdaySchedule = {
    label: 'Entre Semana',
    days: 'Lun - Vie',
    sessions: ['4:00 PM - 7:00 PM'],
  };

  readonly weekendSchedule = {
    label: 'Fines de Semana',
    days: 'Sáb - Dom',
    sessions: ['9:30 AM - 12:30 PM', '1:00 PM - 3:00 PM', '3:30 PM - 6:30 PM'],
  };
}
