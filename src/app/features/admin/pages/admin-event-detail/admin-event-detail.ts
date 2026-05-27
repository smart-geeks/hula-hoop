import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ContractService } from '../../../../core/services/contract.service';
import { QuoteService } from '../../../../core/services/quote.service';
import { EventTaskService } from '../../../../core/services/event-task.service';
import { ExpenseService } from '../../../../core/services/expense.service';
import { PosTicketPrintService } from '../../../../core/services/pos-ticket-print.service';
import { getStatusCfg } from '../../../../core/utils/status-config';
import type { Contract, ContractStatus } from '../../../../core/interfaces/contract';
import type { Quote } from '../../../../core/interfaces/quote';
import type { EventTask, TaskStatus } from '../../../../core/interfaces/event-task';
import type { AdminExpense } from '../../../../core/interfaces/expense';
import { EXPENSE_CATEGORIES } from '../../../../core/interfaces/expense';

type DetailTab = 'resumen' | 'pagos' | 'cotizacion' | 'tareas' | 'gastos';
type PayMethod = 'efectivo' | 'tarjeta' | 'transferencia';

@Component({
  selector: 'app-admin-event-detail',
  templateUrl: './admin-event-detail.html',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminEventDetail {
  private readonly contractService  = inject(ContractService);
  private readonly quoteService     = inject(QuoteService);
  private readonly taskService      = inject(EventTaskService);
  private readonly expenseService   = inject(ExpenseService);
  private readonly ticketPrint      = inject(PosTicketPrintService);
  private readonly route            = inject(ActivatedRoute);
  private readonly router           = inject(Router);

  // ── Core data ─────────────────────────────────────────────
  readonly loading  = signal(true);
  readonly contract = signal<Contract | null>(null);
  readonly quote    = signal<Quote | null>(null);
  readonly tasks    = signal<EventTask[]>([]);
  readonly expenses = signal<AdminExpense[]>([]);

  // ── Navigation ────────────────────────────────────────────
  readonly activeTab = signal<DetailTab>('resumen');

  // ── Toasts ────────────────────────────────────────────────
  readonly toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── Payment dialog ────────────────────────────────────────
  readonly payDialog  = signal(false);
  readonly payMonto   = signal(0);
  readonly payFecha   = signal('');
  readonly payMetodo  = signal<PayMethod>('efectivo');
  readonly payNotas   = signal('');
  readonly paySaving  = signal(false);

  // ── Expense dialog ────────────────────────────────────────
  readonly expDialog      = signal(false);
  readonly expCategoria   = signal(EXPENSE_CATEGORIES[0]);
  readonly expDescripcion = signal('');
  readonly expMonto       = signal(0);
  readonly expFecha       = signal('');
  readonly expSaving      = signal(false);

  // ── Task saving ───────────────────────────────────────────
  readonly taskSaving = signal<string | null>(null);

  // ── Computed ──────────────────────────────────────────────
  readonly EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;

  readonly completedTaskCount = computed(
    () => this.tasks().filter((t) => t.estado === 'completado').length,
  );

  readonly taskProgress = computed(() => {
    const total = this.tasks().length;
    return total > 0 ? Math.round((this.completedTaskCount() / total) * 100) : 0;
  });

  readonly totalExpenses = computed(() =>
    this.expenses().reduce((s, e) => s + e.monto, 0),
  );

  readonly saldoPendiente = computed(() => {
    const c = this.contract();
    if (!c) return 0;
    return Math.max(0, c.total_contrato - c.deposito_pagado);
  });

  readonly pagoProgress = computed(() => {
    const c = this.contract();
    if (!c || c.total_contrato === 0) return 0;
    return Math.min(100, Math.round((c.deposito_pagado / c.total_contrato) * 100));
  });

  readonly statusConfig = computed(() => {
    const c = this.contract();
    if (!c) return { label: '—', classes: 'bg-slate-100 text-slate-500' };
    return getStatusCfg(c.estado, 'contract');
  });

  // ── Step progress bar ─────────────────────────────────
  // Steps: 1=borrador, 2=firmado, 3=liquidado, 4=cancelado(terminal)
  readonly currentStep = computed((): number => {
    switch (this.contract()?.estado) {
      case 'borrador':   return 1;
      case 'firmado':    return 2;
      case 'liquidado':  return 3;
      case 'cancelado':  return 4;
      default:           return 1;
    }
  });

  // Steps definition exposed to template
  readonly LIFECYCLE_STEPS: { label: string; step: number }[] = [
    { label: 'Cotización',  step: 1 },
    { label: 'Firmado',     step: 2 },
    { label: 'Liquidado',   step: 3 },
    { label: 'Cancelado',   step: 4 },
  ];

  // ── Lock: editing disabled when cancelled ─────────────
  readonly isLocked = computed(() => {
    return this.contract()?.estado === 'cancelado';
  });

  constructor() {
    this.loadData();
  }

  private async loadData(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { void this.router.navigate(['/admin/eventos']); return; }

    const today = new Date().toISOString().split('T')[0];
    this.payFecha.set(today);
    this.expFecha.set(today);

    const [contract, tasks, expenses] = await Promise.all([
      this.contractService.getById(id),
      this.taskService.getByContract(id),
      this.expenseService.getByContract(id),
    ]);

    if (!contract) {
      void this.router.navigate(['/admin/eventos']);
      return;
    }

    let quote = null;
    if (contract.quote_id) {
      quote = await this.quoteService.getById(contract.quote_id);
    }

    this.contract.set(contract);
    this.tasks.set(this.sortTasks(tasks));
    this.expenses.set(expenses);
    this.payMonto.set(Math.max(0, contract.total_contrato - contract.deposito_pagado));
    if (quote) this.quote.set(quote);
    this.loading.set(false);
  }

  // ── Advance status ────────────────────────────────────────
  async advanceStatus(newStatus: ContractStatus): Promise<void> {
    const c = this.contract();
    if (!c) return;

    if (newStatus === 'liquidado' && this.saldoPendiente() > 0) {
      const formatted = this.saldoPendiente().toLocaleString('es-MX', {
        style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
      });
      this.showToast('error', `No se puede liquidar el evento: hay saldo pendiente de ${formatted}`);
      return;
    }

    const updated = await this.contractService.update(c.id, { estado: newStatus });
    if (updated) {
      this.contract.set(updated);
      this.showToast('success', 'Estado del contrato actualizado');
    } else {
      this.showToast('error', 'No se pudo actualizar el estado');
    }
  }

  // ── Tabs ──────────────────────────────────────────────────
  setTab(tab: DetailTab): void {
    this.activeTab.set(tab);
  }

  // ── Payment dialog ────────────────────────────────────────
  openPayDialog(): void {
    const c = this.contract();
    this.payMonto.set(c ? Math.max(0, c.total_contrato - c.deposito_pagado) : 0);
    this.payFecha.set(new Date().toISOString().split('T')[0]);
    this.payMetodo.set('efectivo');
    this.payNotas.set('');
    this.payDialog.set(true);
  }

  closePayDialog(): void {
    this.payDialog.set(false);
  }

  async submitPayment(): Promise<void> {
    const c = this.contract();
    if (!c || this.paySaving()) return;

    const monto = this.payMonto();
    if (monto <= 0) {
      this.showToast('error', 'El monto debe ser mayor a cero');
      return;
    }

    this.paySaving.set(true);

    const ok = await this.contractService.addPayment(c.id, {
      monto,
      fecha:  this.payFecha(),
      metodo: this.payMetodo(),
      notas:  this.payNotas().trim() || null,
    });

    if (ok) {
      const newDeposito = c.deposito_pagado + monto;
      const isLiquidado = newDeposito >= c.total_contrato;

      if (isLiquidado && c.estado !== 'liquidado') {
        await this.contractService.update(c.id, { estado: 'liquidado' as ContractStatus });
      }

      // Refresh contract
      const updated = await this.contractService.getById(c.id);
      if (updated) this.contract.set(updated);

      this.closePayDialog();
      this.showToast('success', `Pago de ${monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} registrado`);

      // Imprimir comprobante con datos del contrato actualizado
      const contractForPrint = updated ?? c;
      this.ticketPrint.printPayment(contractForPrint, {
        id:          '',
        contract_id: c.id,
        monto,
        fecha:       this.payFecha(),
        metodo:      this.payMetodo(),
        notas:       this.payNotas().trim() || null,
        created_at:  new Date().toISOString(),
      }, this.quote());
    } else {
      this.showToast('error', 'No se pudo registrar el pago');
    }

    this.paySaving.set(false);
  }

  // ── Expense dialog ────────────────────────────────────────
  openExpDialog(): void {
    this.expCategoria.set(EXPENSE_CATEGORIES[0]);
    this.expDescripcion.set('');
    this.expMonto.set(0);
    this.expFecha.set(new Date().toISOString().split('T')[0]);
    this.expDialog.set(true);
  }

  closeExpDialog(): void {
    this.expDialog.set(false);
  }

  async submitExpense(): Promise<void> {
    const c = this.contract();
    if (!c || this.expSaving()) return;

    const descripcion = this.expDescripcion().trim();
    if (!descripcion || this.expMonto() <= 0) {
      this.showToast('error', 'Completa descripción y monto');
      return;
    }

    this.expSaving.set(true);

    const created = await this.expenseService.create({
      categoria:   this.expCategoria(),
      descripcion,
      monto:       this.expMonto(),
      fecha:       this.expFecha(),
      contract_id: c.id,
    });

    if (created) {
      this.expenses.update((list) => [created, ...list]);
      this.closeExpDialog();
      this.showToast('success', 'Gasto registrado');
    } else {
      this.showToast('error', 'No se pudo registrar el gasto');
    }

    this.expSaving.set(false);
  }

  async deleteExpense(expense: AdminExpense): Promise<void> {
    const ok = await this.expenseService.delete(expense.id);
    if (ok) {
      this.expenses.update((list) => list.filter((e) => e.id !== expense.id));
      this.showToast('success', 'Gasto eliminado');
    }
  }

  // ── Tasks ─────────────────────────────────────────────────
  async toggleTask(task: EventTask): Promise<void> {
    if (this.taskSaving() === task.id) return;
    const newStatus: TaskStatus = task.estado === 'completado' ? 'pendiente' : 'completado';
    this.taskSaving.set(task.id);
    const ok = await this.taskService.updateStatus(task.id, newStatus);
    if (ok) {
      this.tasks.update((all) =>
        all.map((t) => (t.id === task.id ? { ...t, estado: newStatus } : t)),
      );
    }
    this.taskSaving.set(null);
  }

  // ── Helpers ───────────────────────────────────────────────
  formatDate(dateStr: string): string {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  formatTime(time: string): string {
    const [h, m] = time.split(':');
    const hour = parseInt(h, 10);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  }

  goBack(): void {
    void this.router.navigate(['/admin/eventos']);
  }

  stepProgressWidth(): string {
    const pct = (this.currentStep() - 1) / (this.LIFECYCLE_STEPS.length - 1) * 100;
    return `calc(${pct}% - (${pct / 100} * 2.5rem))`;
  }

  private sortTasks(tasks: EventTask[]): EventTask[] {
    return [...tasks].sort((a, b) => {
      if (!a.hora_inicio && !b.hora_inicio) return 0;
      if (!a.hora_inicio) return 1;
      if (!b.hora_inicio) return -1;
      return a.hora_inicio.localeCompare(b.hora_inicio);
    });
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 3500);
  }
}
