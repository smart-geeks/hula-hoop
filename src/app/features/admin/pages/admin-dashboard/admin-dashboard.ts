import {
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
import { ReportService } from '../../../../core/services/report.service';
import type { DashboardData } from '../../../../core/services/report.service';
import type { Contract } from '../../../../core/interfaces/contract';

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.html',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboard implements OnInit {
  private readonly contractService = inject(ContractService);
  private readonly reportService   = inject(ReportService);

  readonly loading         = signal(true);
  readonly upcomingEvents  = signal<Contract[]>([]);
  readonly dashData        = signal<DashboardData | null>(null);

  readonly alerts = computed(() => {
    const d = this.dashData();
    const list: { icon: string; text: string; color: string; link: string }[] = [];
    if (d && d.low_stock_count > 0) {
      list.push({
        icon: 'pi-box',
        text: `${d.low_stock_count} artículo${d.low_stock_count !== 1 ? 's' : ''} bajo stock mínimo`,
        color: 'text-amber-600',
        link: '../inventario',
      });
    }
    const vencidos = this.upcomingEvents().filter((c) => {
      const evDate = new Date(c.fecha_evento + 'T12:00:00');
      return evDate < new Date() && c.saldo_pendiente > 0 && c.estado !== 'cancelado';
    });
    if (vencidos.length > 0) {
      list.push({
        icon: 'pi-clock',
        text: `${vencidos.length} evento${vencidos.length !== 1 ? 's' : ''} con saldo sin liquidar`,
        color: 'text-red-600',
        link: '../contratos',
      });
    }
    return list;
  });

  readonly chartMax = computed(() => {
    const chart = this.dashData()?.chart ?? [];
    return Math.max(...chart.map((p) => Math.max(p.ingresos, p.gastos)), 1);
  });

  async ngOnInit(): Promise<void> {
    const [upcoming, dash] = await Promise.all([
      this.contractService.getUpcoming(30),
      this.reportService.getDashboard(),
    ]);
    this.upcomingEvents.set(upcoming);
    this.dashData.set(dash);
    this.loading.set(false);
  }

  getStatusClass(estado: string): string {
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

  formatCurrencyShort(value: number): string {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
    return `$${value.toFixed(0)}`;
  }
}
