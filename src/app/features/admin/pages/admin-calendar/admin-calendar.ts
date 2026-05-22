import {
  NgZone,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContractService } from '../../../../core/services/contract.service';
import type { Contract } from '../../../../core/interfaces/contract';

interface CalendarDay {
  date: Date;
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: Contract[];
}

@Component({
  selector: 'app-admin-calendar',
  templateUrl: './admin-calendar.html',
  imports: [DatePipe, CurrencyPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCalendar implements OnInit {
  private readonly cdr             = inject(ChangeDetectorRef);
  private readonly ngZone           = inject(NgZone);
  private readonly contractService = inject(ContractService);

  readonly loading           = signal(true);
  readonly contracts         = signal<Contract[]>([]);
  readonly currentDate       = signal(new Date());
  readonly selectedDay       = signal<CalendarDay | null>(null);

  readonly weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  readonly calendarDays = computed<CalendarDay[]>(() => {
    const ref = this.currentDate();
    const year = ref.getFullYear();
    const month = ref.getMonth();
    const today = new Date();

    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay(); // 0=Sun
    const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;

    const days: CalendarDay[] = [];
    for (let i = 0; i < totalCells; i++) {
      const date = new Date(year, month, 1 - startOffset + i);
      const isCurrentMonth = date.getMonth() === month;
      const isToday =
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();

      const dateStr = date.toISOString().split('T')[0];
      const events = this.contracts().filter((c) => c.fecha_evento === dateStr);

      days.push({ date, dayNum: date.getDate(), isCurrentMonth, isToday, events });
    }
    return days;
  });

  readonly monthLabel = computed(() =>
    this.currentDate().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }),
  );

  readonly eventsThisMonth = computed(() => {
    const ref = this.currentDate();
    const year = ref.getFullYear();
    const month = ref.getMonth();
    return this.contracts().filter((c) => {
      const d = new Date(c.fecha_evento + 'T12:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    });
  });

  readonly monthStats = computed(() => {
    const evs = this.eventsThisMonth();
    const total = evs.reduce((s, c) => s + c.total_contrato, 0);
    const confirmados = evs.filter((c) => c.estado === 'firmado' || c.estado === 'liquidado').length;
    return { count: evs.length, total, confirmados };
  });

  async ngOnInit(): Promise<void> {
    const data = await this.contractService.getAll();
    this.ngZone.run(() => {
  this.contracts.set(data);
      this.loading.set(false);
      this.cdr.detectChanges();
    });
  }

  prevMonth(): void {
    const d = new Date(this.currentDate());
    d.setMonth(d.getMonth() - 1);
    this.currentDate.set(d);
    this.selectedDay.set(null);
  }

  nextMonth(): void {
    const d = new Date(this.currentDate());
    d.setMonth(d.getMonth() + 1);
    this.currentDate.set(d);
    this.selectedDay.set(null);
  }

  goToToday(): void {
    this.currentDate.set(new Date());
    this.selectedDay.set(null);
  }

  selectDay(day: CalendarDay): void {
    if (this.selectedDay()?.date.toISOString() === day.date.toISOString()) {
      this.selectedDay.set(null);
    } else {
      this.selectedDay.set(day);
    }
  }

  getStatusDot(estado: string): string {
    const map: Record<string, string> = {
      borrador:  'bg-slate-400',
      firmado:   'bg-blue-500',
      liquidado: 'bg-emerald-500',
      cancelado: 'bg-red-400',
    };
    return map[estado] ?? 'bg-slate-400';
  }

  getStatusBadge(estado: string): string {
    const map: Record<string, string> = {
      borrador:  'bg-slate-100 text-slate-600',
      firmado:   'bg-blue-100 text-blue-700',
      liquidado: 'bg-emerald-100 text-emerald-700',
      cancelado: 'bg-red-100 text-red-700',
    };
    return map[estado] ?? 'bg-slate-100 text-slate-600';
  }

  getStatusLabel(estado: string): string {
    const map: Record<string, string> = {
      borrador:  'Borrador',
      firmado:   'Contratado',
      liquidado: 'Liquidado',
      cancelado: 'Cancelado',
    };
    return map[estado] ?? estado;
  }

  getStatusBg(estado: string): string {
    const map: Record<string, string> = {
      borrador:  'border-l-slate-400',
      firmado:   'border-l-blue-500',
      liquidado: 'border-l-emerald-500',
      cancelado: 'border-l-red-400',
    };
    return map[estado] ?? 'border-l-slate-400';
  }
}
