import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContractService } from '../../../../core/services/contract.service';
import { ExpenseService } from '../../../../core/services/expense.service';
import type { Contract } from '../../../../core/interfaces/contract';

interface KpiCard {
  label: string;
  value: string;
  sub: string;
  icon: string;
  color: string;
  bg: string;
}

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.html',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboard implements OnInit {
  private readonly contractService = inject(ContractService);
  private readonly expenseService = inject(ExpenseService);

  readonly loading = signal(true);
  readonly upcomingEvents = signal<Contract[]>([]);

  readonly kpis = signal<KpiCard[]>([
    { label: 'Ingresos del mes', value: '$0', sub: 'Contratos liquidados', icon: 'pi-dollar', color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Eventos confirmados', value: '0', sub: 'Este mes', icon: 'pi-star', color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Por cobrar', value: '$0', sub: 'Saldo pendiente total', icon: 'pi-clock', color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Gastos del mes', value: '$0', sub: 'Gastos administrativos', icon: 'pi-wallet', color: 'text-rose-600', bg: 'bg-rose-50' },
  ]);

  async ngOnInit(): Promise<void> {
    const upcoming = await this.contractService.getUpcoming(30);
    this.upcomingEvents.set(upcoming);

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const gastos = await this.expenseService.getTotalByPeriod(from, to);

    const confirmed = upcoming.filter((c) => c.estado === 'firmado' || c.estado === 'liquidado');
    const porCobrar = upcoming.reduce((sum, c) => sum + (c.saldo_pendiente ?? 0), 0);
    const ingresos = upcoming
      .filter((c) => c.estado === 'liquidado')
      .reduce((sum, c) => sum + c.total_contrato, 0);

    this.kpis.set([
      { label: 'Ingresos del mes', value: this.formatCurrency(ingresos), sub: 'Contratos liquidados', icon: 'pi-dollar', color: 'text-emerald-600', bg: 'bg-emerald-50' },
      { label: 'Eventos confirmados', value: String(confirmed.length), sub: 'Este mes', icon: 'pi-star', color: 'text-blue-600', bg: 'bg-blue-50' },
      { label: 'Por cobrar', value: this.formatCurrency(porCobrar), sub: 'Saldo pendiente total', icon: 'pi-clock', color: 'text-amber-600', bg: 'bg-amber-50' },
      { label: 'Gastos del mes', value: this.formatCurrency(gastos), sub: 'Gastos administrativos', icon: 'pi-wallet', color: 'text-rose-600', bg: 'bg-rose-50' },
    ]);

    this.loading.set(false);
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value);
  }

  getStatusClass(estado: string): string {
    const map: Record<string, string> = {
      borrador: 'bg-slate-100 text-slate-600',
      firmado: 'bg-blue-100 text-blue-700',
      liquidado: 'bg-emerald-100 text-emerald-700',
      cancelado: 'bg-red-100 text-red-700',
    };
    return map[estado] ?? 'bg-slate-100 text-slate-600';
  }

  getStatusLabel(estado: string): string {
    const map: Record<string, string> = {
      borrador: 'Borrador',
      firmado: 'Contratado',
      liquidado: 'Liquidado',
      cancelado: 'Cancelado',
    };
    return map[estado] ?? estado;
  }
}
