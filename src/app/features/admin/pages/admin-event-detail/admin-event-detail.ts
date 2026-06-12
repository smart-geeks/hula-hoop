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
import { SupabaseService } from '../../../../core/services/supabase.service';
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
  private readonly supabase           = inject(SupabaseService);
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

  setTab(tab: DetailTab): void {
    this.activeTab.set(tab);
  }

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
  readonly EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;

  // ── Tasks ─────────────────────────────────────────────────
  readonly taskSaving       = signal<string | null>(null);
  readonly showCreateDialog = signal(false);
  readonly profilesList     = signal<any[]>([]);

  // ── Computed ──────────────────────────────────────────────
  readonly isLocked = computed(() => {
    const c = this.contract();
    return c ? (c.estado === 'concluido' || c.estado === 'cancelado') : false;
  });

  readonly completedTaskCount = computed(
    () => this.tasks().filter((t) => t.estado === 'completado').length,
  );
  readonly taskProgress = computed(() => {
    const total = this.tasks().length;
    if (total === 0) return 0;
    return Math.round((this.completedTaskCount() / total) * 100);
  });

  readonly totalExpenses = computed(() =>
    this.expenses().reduce((sum, e) => sum + (e.monto ?? 0), 0),
  );

  readonly saldoPendiente = computed(() => this.contract()?.saldo_pendiente ?? 0);

  readonly pagoProgress = computed(() => {
    const c = this.contract();
    if (!c || c.total_contrato <= 0) return 0;
    const paid = c.total_contrato - c.saldo_pendiente;
    return Math.min(100, Math.max(0, Math.round((paid / c.total_contrato) * 100)));
  });

  readonly statusConfig = computed(() => {
    const status = this.contract()?.estado ?? 'borrador';
    return getStatusCfg(status, 'contract');
  });

  constructor() {
    this.loadData();
  }

  private async loadData(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    const [contract, tasks, expenses] = await Promise.all([
      this.contractService.getById(id),
      this.taskService.getByContract(id),
      this.expenseService.getByContract(id),
    ]);

    this.contract.set(contract);
    this.tasks.set(this.sortTasks(tasks));
    this.expenses.set(expenses);

    // Fetch quote if contract has quote_id
    if (contract?.quote_id) {
      const q = await this.quoteService.getById(contract.quote_id);
      this.quote.set(q);
    }

    this.loading.set(false);
  }

  // ── Payments ──────────────────────────────────────────────
  openPayDialog(): void {
    if (this.isLocked()) return;
    this.payMonto.set(this.contract()?.saldo_pendiente ?? 0);
    this.payFecha.set(new Date().toISOString().split('T')[0]);
    this.payMetodo.set('efectivo');
    this.payNotas.set('');
    this.payDialog.set(true);
  }

  closePayDialog(): void {
    this.payDialog.set(false);
  }

  async submitPayment(): Promise<void> {
    await this.registerPayment(
      this.payMonto(),
      this.payFecha(),
      this.payMetodo(),
      this.payNotas().trim()
    );
  }

  async registerPayment(monto: number, fecha: string, metodo: PayMethod, notas: string): Promise<void> {
    const c = this.contract();
    if (!c || monto <= 0 || !fecha) return;

    this.paySaving.set(true);
    const success = await this.contractService.addPayment(c.id, {
      monto, fecha, metodo, notas: notas || 'Pago registrado desde Event Hub',
    });

    if (success) {
      this.showToast('success', 'Pago registrado correctamente');
      this.payDialog.set(false);
      await this.loadData();
    } else {
      this.showToast('error', 'Error al registrar el pago');
    }
    this.paySaving.set(false);
  }

  async printReceipt(): Promise<void> {
    const c = this.contract();
    if (!c) return;
    try {
      const lastPayment = c.payments && c.payments.length > 0
        ? c.payments[c.payments.length - 1]
        : {
            id: '',
            contract_id: c.id,
            monto: c.deposito_pagado,
            fecha: c.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
            metodo: 'efectivo' as const,
            notas: 'Pago inicial / abonos',
            created_at: c.created_at || new Date().toISOString(),
          };
      this.ticketPrint.printPayment(c, lastPayment, this.quote());
      this.showToast('success', 'Ticket enviado a la impresora');
    } catch (err: any) {
      console.error(err);
      this.showToast('error', `Error al imprimir: ${err.message || err}`);
    }
  }

  // ── Expenses ──────────────────────────────────────────────
  openExpDialog(): void {
    if (this.isLocked()) return;
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

    const category = this.expCategoria();
    const description = this.expDescripcion().trim();
    const amount = this.expMonto();
    const date = this.expFecha();

    if (!description || amount <= 0 || !date) {
      this.showToast('error', 'Completa todos los campos obligatorios');
      return;
    }

    this.expSaving.set(true);
    const res = await this.expenseService.create({
      contract_id: c.id,
      categoria: category,
      descripcion: description,
      monto: amount,
      fecha: date,
      venue_id: c.venue_id,
    });

    if (res) {
      this.showToast('success', 'Gasto registrado correctamente');
      this.closeExpDialog();
      await this.loadData();
    } else {
      this.showToast('error', 'Error al registrar el gasto');
    }
    this.expSaving.set(false);
  }

  async deleteExpense(expense: AdminExpense): Promise<void> {
    if (this.isLocked()) return;
    const ok = await this.expenseService.delete(expense.id);
    if (ok) {
      this.expenses.update((list) => list.filter((e) => e.id !== expense.id));
      this.showToast('success', 'Gasto eliminado');
    } else {
      this.showToast('error', 'No se pudo eliminar el gasto');
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

  async openCreateDialog(): Promise<void> {
    this.showCreateDialog.set(true);
    const client = this.supabase.client;
    if (client && this.profilesList().length === 0) {
      const { data } = await client
        .from('profiles')
        .select('id, full_name')
        .order('full_name');
      this.profilesList.set(data ?? []);
    }
  }

  async createTask(
    title: string,
    desc: string,
    time: string,
    assigneeId: string,
  ): Promise<void> {
    if (!title.trim() || !this.contract()) return;

    const contractId = this.contract()!.id;
    const dateStr = this.contract()!.fecha_evento;

    let startIso: string | null = null;
    let endIso: string | null = null;
    if (time) {
      startIso = new Date(`${dateStr}T${time}:00`).toISOString();
      const endMins = parseInt(time.split(':')[1], 10) + 30;
      const endHours = parseInt(time.split(':')[0], 10) + Math.floor(endMins / 60);
      const endFmt = `${String(endHours % 24).padStart(2, '0')}:${String(
        endMins % 60,
      ).padStart(2, '0')}`;
      endIso = new Date(`${dateStr}T${endFmt}:00`).toISOString();
    }

    const payload = {
      contract_id: contractId,
      titulo: title,
      descripcion: desc || undefined,
      asignado_a: assigneeId || undefined,
      hora_inicio: startIso || undefined,
      hora_fin: endIso || undefined,
      estado: 'pendiente' as const,
    };

    const created = await this.taskService.create(payload);
    if (created) {
      const allTasks = await this.taskService.getByContract(contractId);
      this.tasks.set(this.sortTasks(allTasks));
      this.showCreateDialog.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  formatDate(dateStr: string): string {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  formatTime(time: string): string {
    const timePart = time.includes('T') ? time.split('T')[1] : time;
    const [h, m] = timePart.split(':');
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
    setTimeout(() => this.toast.set(null), 3000);
  }

  // Lifecycle configuration
  readonly LIFECYCLE_STEPS = [
    { step: 1, label: 'Cotizado',   status: 'cotizado' },
    { step: 2, label: 'Contratado', status: 'firmado' },
    { step: 3, label: 'Liquidado',  status: 'liquidado' },
    { step: 4, label: 'Concluido',  status: 'concluido' },
  ];

  readonly currentStep = computed(() => {
    const status = this.contract()?.estado ?? 'borrador';
    if (status === 'cancelado') return 0;
    if (status === 'borrador') return 1;
    if (status === 'firmado') return 2;
    if (status === 'liquidado') return 3;
    if (status === 'concluido') return 4;
    return 1;
  });
}
