import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContractService } from '../../../../core/services/contract.service';
import type { Contract } from '../../../../core/interfaces/contract';

@Component({
  selector: 'app-admin-calendar',
  templateUrl: './admin-calendar.html',
  imports: [DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCalendar implements OnInit {
  private readonly contractService = inject(ContractService);

  readonly loading = signal(true);
  readonly contracts = signal<Contract[]>([]);
  readonly currentDate = signal(new Date());

  readonly currentMonthLabel = () => {
    return this.currentDate().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  };

  async ngOnInit(): Promise<void> {
    const data = await this.contractService.getAll();
    this.contracts.set(data);
    this.loading.set(false);
  }

  prevMonth(): void {
    const d = new Date(this.currentDate());
    d.setMonth(d.getMonth() - 1);
    this.currentDate.set(d);
  }

  nextMonth(): void {
    const d = new Date(this.currentDate());
    d.setMonth(d.getMonth() + 1);
    this.currentDate.set(d);
  }

  getStatusColor(estado: string): string {
    const map: Record<string, string> = {
      borrador: 'bg-slate-400',
      firmado: 'bg-blue-500',
      liquidado: 'bg-emerald-500',
      cancelado: 'bg-red-400',
    };
    return map[estado] ?? 'bg-slate-400';
  }

  getEventsForMonth(): Contract[] {
    const d = this.currentDate();
    const year = d.getFullYear();
    const month = d.getMonth();
    return this.contracts().filter((c) => {
      const ev = new Date(c.fecha_evento + 'T12:00:00');
      return ev.getFullYear() === year && ev.getMonth() === month;
    });
  }
}
