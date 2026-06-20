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
import { AuthService } from '../../../../core/services/auth.service';
import { QuoteAmendmentService } from '../../../../core/services/quote-amendment.service';
import { ExtraService } from '../../../../core/services/extra.service';
import { getStatusCfg } from '../../../../core/utils/status-config';
import type { Contract, ContractStatus, ContractPayment } from '../../../../core/interfaces/contract';
import type { Quote } from '../../../../core/interfaces/quote';
import type { EventTask, TaskStatus } from '../../../../core/interfaces/event-task';
import type { AdminExpense } from '../../../../core/interfaces/expense';
import { EXPENSE_CATEGORIES } from '../../../../core/interfaces/expense';
import type { QuoteAmendment, AmendmentItem } from '../../../../core/interfaces/quote-amendment';
import type { Extra } from '../../../../core/interfaces/extra';

type DetailTab = 'resumen' | 'contrato' | 'pagos' | 'cotizacion' | 'tareas' | 'gastos';
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
  private readonly authService       = inject(AuthService);
  private readonly route            = inject(ActivatedRoute);
  private readonly router           = inject(Router);
  private readonly amendmentService = inject(QuoteAmendmentService);
  private readonly extraService     = inject(ExtraService);

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

  readonly statusIcon = computed(() => {
    const status = this.contract()?.estado ?? 'borrador';
    switch (status) {
      case 'borrador': return 'pi-pencil';
      case 'firmado': return 'pi-check';
      case 'liquidado': return 'pi-wallet';
      case 'concluido': return 'pi-flag';
      case 'cancelado': return 'pi-times-circle';
      default: return 'pi-pencil';
    }
  });

  readonly documentosCompletos = computed(() => {
    const c = this.contract();
    if (!c) return false;
    const tieneFirma = !!(c.firma_url || c.pdf_url);
    return !!(c.ine_url && c.comprobante_url && tieneFirma);
  });

  readonly tareasStatus = computed((): 'completo' | 'pendiente' | 'sin-tareas' => {
    const total = this.tasks().length;
    if (total === 0) return 'sin-tareas';
    return this.completedTaskCount() === total ? 'completo' : 'pendiente';
  });

  readonly tareasBorderClass = computed(() => {
    const s = this.tareasStatus();
    if (s === 'completo') return 'border-emerald-200';
    if (s === 'pendiente') return 'border-amber-200';
    return 'border-slate-200';
  });

  // ── Amendment ─────────────────────────────────────────────
  readonly amendment         = signal<QuoteAmendment | null>(null);
  readonly amendmentEditing  = signal(false);
  readonly amendmentItems    = signal<AmendmentItem[]>([]);
  readonly amendmentNotas    = signal('');
  readonly amendmentSaving   = signal(false);
  readonly availableExtras   = signal<Extra[]>([]);

  // ── Amendment payment dialog ──────────────────────────────
  readonly amendPayDialog  = signal(false);
  readonly amendPayMonto   = signal(0);
  readonly amendPayFecha   = signal('');
  readonly amendPayMetodo  = signal<PayMethod>('efectivo');
  readonly amendPayNotas   = signal('');
  readonly amendPaySaving  = signal(false);

  // ── Send link dialog ──────────────────────────────────────
  readonly sendLinkDialog = signal(false);

  // ── Expediente Digital ────────────────────────────────
  readonly uploadingDoc    = signal<'ine' | 'comprobante' | 'firma' | 'pdf' | null>(null);
  readonly expandedReplace = signal<string | null>(null);

  readonly docMeta = computed(() =>
    (this.contract()?.doc_metadata ?? {}) as Record<
      string,
      { replaced_by: string; replaced_at: string } | null
    >,
  );

  readonly amendmentDelta = computed(() => {
    const q = this.quote();
    if (!q) return 0;
    const originalTotal = q.total ?? 0;
    const newTotal = this.amendmentItems().reduce((s, i) => s + i.subtotal, 0);
    return newTotal - originalTotal;
  });

  readonly hasActiveAmendment = computed(() => {
    const a = this.amendment();
    return a !== null && (a.status === 'draft' || a.status === 'pending_approval');
  });

  readonly amendmentNewTotal = computed(() =>
    this.amendmentItems().reduce((s, i) => s + i.subtotal, 0)
  );

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

    if (id) {
      const activeAmendment = await this.amendmentService.getActiveByContract(id);
      this.amendment.set(activeAmendment);
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
      monto, fecha, metodo, tipo: 'abono', notas: notas || 'Pago registrado desde Event Hub',
    });

    if (success) {
      this.showToast('success', 'Pago registrado correctamente');
      this.payDialog.set(false);
      await this.loadData();
      await this.printReceipt();
    } else {
      this.showToast('error', 'Error al registrar el pago');
    }
    this.paySaving.set(false);
  }

  async printReceipt(): Promise<void> {
    const c = this.contract();
    if (!c) return;
    try {
      let lastPayment: ContractPayment;
      if (c.payments && c.payments.length > 0) {
        const sorted = [...c.payments].sort((a, b) => 
          new Date(a.created_at || a.fecha).getTime() - new Date(b.created_at || b.fecha).getTime()
        );
        lastPayment = sorted[sorted.length - 1];
      } else {
        lastPayment = {
          id: '',
          contract_id: c.id,
          monto: Number(c.deposito_pagado),
          fecha: c.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          metodo: 'efectivo' as const,
          tipo: 'anticipo' as const,
          notas: 'Pago inicial / abonos',
          created_at: c.created_at || new Date().toISOString(),
        };
      }
      this.ticketPrint.printPayment(c, lastPayment, this.quote());
      this.showToast('success', 'Ticket enviado a la impresora');
    } catch (err: any) {
      console.error(err);
      this.showToast('error', `Error al imprimir: ${err.message || err}`);
    }
  }

  async printReceiptForPayment(payment: ContractPayment): Promise<void> {
    const c = this.contract();
    if (!c) return;
    try {
      this.ticketPrint.printPayment(c, payment, this.quote());
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
  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  formatTime(time: string | null | undefined): string {
    if (!time) return '—';
    const timePart = time.includes('T') ? time.split('T')[1] : time;
    const [h, m] = timePart.split(':');
    const hour = parseInt(h, 10);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  }

  getContractPackage(quote: any): string {
    if (!quote || !quote.items || quote.items.length === 0) return '—';
    return quote.items[0]?.descripcion || '—';
  }

  getContractSnack(quote: any): string {
    if (!quote || !quote.items) return '—';
    const snackItem = quote.items.find((it: any) => it.descripcion.startsWith('Merienda:'));
    if (!snackItem) return '—';
    return snackItem.descripcion.replace(/^Merienda:\s*/, '');
  }

  getContractExtras(quote: any): string {
    if (!quote || !quote.items) return '—';
    const packageDesc = this.getContractPackage(quote);
    const extras = quote.items.filter((it: any) => 
      it.descripcion !== packageDesc && !it.descripcion.startsWith('Merienda:')
    );
    if (extras.length === 0) return '—';
    return extras.map((it: any) => `${it.descripcion} (x${it.cantidad})`).join(', ');
  }

  // ── Amendment methods ──────────────────────────────────────
  async startAmendmentEdit(): Promise<void> {
    const q = this.quote();
    const c = this.contract();
    if (!q || !c) return;

    const extras = await this.extraService.getActiveExtrasByVenue(c.venue_id);
    this.availableExtras.set(extras);

    const currentItems: AmendmentItem[] = (q.items ?? []).map(item => ({
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal,
    }));
    this.amendmentItems.set(currentItems);
    this.amendmentNotas.set('');
    this.amendmentEditing.set(true);
  }

  cancelAmendmentEdit(): void {
    this.amendmentEditing.set(false);
    this.amendmentItems.set([]);
    this.amendmentNotas.set('');
  }

  addExtraFromCatalog(extra: Extra): void {
    const item: AmendmentItem = {
      descripcion: extra.name,
      cantidad: 1,
      precio_unitario: extra.price_cents / 100,
      subtotal: extra.price_cents / 100,
    };
    this.amendmentItems.update(items => [...items, item]);
  }

  extraDisplayPrice(extra: Extra): number {
    return extra.price_cents / 100;
  }

  addFreeLineItem(): void {
    const item: AmendmentItem = {
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0,
      subtotal: 0,
    };
    this.amendmentItems.update(items => [...items, item]);
  }

  updateItemField(index: number, field: keyof AmendmentItem, value: string | number): void {
    this.amendmentItems.update(items => {
      const updated = [...items];
      const item = { ...updated[index] };
      if (field === 'descripcion') {
        item.descripcion = value as string;
      } else if (field === 'cantidad') {
        item.cantidad = Number(value);
        item.subtotal = item.cantidad * item.precio_unitario;
      } else if (field === 'precio_unitario') {
        item.precio_unitario = Number(value);
        item.subtotal = item.cantidad * item.precio_unitario;
      }
      updated[index] = item;
      return updated;
    });
  }

  removeItem(index: number): void {
    this.amendmentItems.update(items => items.filter((_, i) => i !== index));
  }

  async saveAmendmentAndOpenPayment(): Promise<void> {
    const c = this.contract();
    const q = this.quote();
    if (!c || !q) return;

    const items = this.amendmentItems();
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    const descuento = q.descuento ?? 0;
    const total = subtotal - descuento;
    const delta = total - (q.total ?? 0);

    this.amendmentSaving.set(true);

    const existing = this.amendment();
    let result: QuoteAmendment | null;

    if (existing && existing.status === 'draft') {
      result = await this.amendmentService.updateDraft(existing.id, {
        proposed_items: items,
        proposed_subtotal: subtotal,
        proposed_descuento: descuento,
        proposed_total: total,
        delta_monto: delta,
        notas: this.amendmentNotas(),
      });
    } else {
      const profile = this.authService.userProfile();
      result = await this.amendmentService.createDraft({
        quote_id: q.id,
        contract_id: c.id,
        proposed_items: items,
        proposed_subtotal: subtotal,
        proposed_descuento: descuento,
        proposed_total: total,
        delta_monto: delta,
        notas: this.amendmentNotas(),
        created_by: profile?.id,
      });
    }

    this.amendmentSaving.set(false);

    if (!result) {
      this.showToast('error', 'Error al guardar los cambios');
      return;
    }

    this.amendment.set(result);
    this.amendmentEditing.set(false);

    this.amendPayMonto.set(Math.abs(delta));
    this.amendPayFecha.set(new Date().toISOString().split('T')[0]);
    this.amendPayMetodo.set('efectivo');
    this.amendPayNotas.set(`Extra: ${this.amendmentNotas() || 'Modificación de cotización'}`);
    this.amendPayDialog.set(true);
  }

  async submitAmendmentPayment(): Promise<void> {
    const c = this.contract();
    const a = this.amendment();
    if (!c || !a || this.amendPaySaving()) return;

    const monto = this.amendPayMonto();
    const fecha = this.amendPayFecha();
    if (monto <= 0 || !fecha) return;

    this.amendPaySaving.set(true);
    try {
      const success = await this.contractService.addPayment(c.id, {
        monto,
        fecha,
        metodo: this.amendPayMetodo(),
        tipo: 'extra',
        notas: this.amendPayNotas() || 'Pago por modificación de cotización',
      });

      if (!success) {
        this.showToast('error', 'Error al registrar el pago');
        return;
      }

      await this.loadData();
      const updatedContract = this.contract();
      const lastPayment = updatedContract?.payments
        ?.sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime())[0];

      if (lastPayment) {
        await this.amendmentService.linkPaymentAndSubmit(a.id, lastPayment.id);
        const updatedAmendment = await this.amendmentService.getActiveByContract(c.id);
        this.amendment.set(updatedAmendment);
      }

      this.amendPayDialog.set(false);
      this.sendLinkDialog.set(true);
    } finally {
      this.amendPaySaving.set(false);
    }
  }

  getAmendmentWhatsappLink(): string {
    const c = this.contract();
    if (!c) return '';
    const phone = (c.client?.telefono ?? '').replace(/\D/g, '');
    const formattedPhone = phone.length === 10 ? '52' + phone : phone;
    const link = `${window.location.origin}/contrato/${c.id}`;
    const a = this.amendment();
    const delta = a ? a.delta_monto.toLocaleString('es-MX') : '0';
    const text = encodeURIComponent(
      `*Hula Hoop - Modificación de tu evento*\n\n` +
      `Hola ${c.client?.nombre ?? 'Cliente'},\n\n` +
      `Hemos actualizado los detalles de tu evento del *${this.formatDate(c.fecha_evento)}*.\n\n` +
      `Diferencia: *$${delta} MXN* (ya registrado el pago).\n\n` +
      `Por favor revisa y autoriza los cambios aquí:\n` +
      `🔗 ${link}\n\n` +
      `¡Muchas gracias!`
    );
    return `https://wa.me/${formattedPhone}?text=${text}`;
  }

  getAmendmentEmailLink(): string {
    const c = this.contract();
    if (!c) return '';
    const email = c.client?.email ?? '';
    const link = `${window.location.origin}/contrato/${c.id}`;
    const subject = encodeURIComponent(`Modificación de tu evento — Hula Hoop`);
    const body = encodeURIComponent(
      `Hola ${c.client?.nombre ?? 'Cliente'},\n\n` +
      `Hemos actualizado los detalles de tu evento del ${this.formatDate(c.fecha_evento)}.\n\n` +
      `Por favor revisa y autoriza los cambios aquí:\n${link}\n\n` +
      `Atentamente,\nHula Hoop Eventos`
    );
    return `mailto:${email}?subject=${subject}&body=${body}`;
  }

  copyAmendmentLink(): void {
    const c = this.contract();
    if (!c) return;
    const link = `${window.location.origin}/contrato/${c.id}`;
    navigator.clipboard.writeText(link).then(() => {
      this.showToast('success', 'Link copiado al portapapeles');
    }).catch(() => {
      this.showToast('error', 'No se pudo copiar el link');
    });
  }

  goBack(): void {
    void this.router.navigate(['/admin/eventos']);
  }

  scrollToTab(tab: DetailTab): void {
    this.setTab(tab);
    setTimeout(() => {
      document.getElementById('tabs-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
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

  async updateContractStatus(estado: ContractStatus): Promise<void> {
    const c = this.contract();
    if (!c) return;

    this.loading.set(true);
    const updated = await this.contractService.update(c.id, { estado });
    this.loading.set(false);

    if (updated) {
      this.contract.set(updated);
      this.showToast('success', `Estado de contrato actualizado a ${estado}`);
    } else {
      this.showToast('error', 'No se pudo actualizar el estado del contrato');
    }
  }

  async onContractFileUpload(event: Event): Promise<void> {
    const c = this.contract();
    if (!c) return;

    const input = event.target as HTMLInputElement;
    if (!input || !input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.loading.set(true);
    const uploadedUrl = await this.contractService.uploadContractPdf(c.id, file);
    this.loading.set(false);

    if (uploadedUrl) {
      const updated = await this.contractService.getById(c.id);
      if (updated) {
        this.contract.set(updated);
      }
      this.showToast('success', 'Contrato firmado subido con éxito');
    } else {
      this.showToast('error', 'Error al subir el archivo del contrato');
    }
  }

  toggleReplace(field: string): void {
    this.expandedReplace.update((cur) => (cur === field ? null : field));
  }

  async onDocUpload(
    field: 'ine' | 'comprobante' | 'firma' | 'pdf',
    event: Event,
  ): Promise<void> {
    const c = this.contract();
    if (!c) return;

    const input = event.target as HTMLInputElement;
    if (!input?.files?.length) return;
    const file = input.files[0];

    const adminName = this.authService.userProfile()?.full_name ?? 'Admin';
    this.uploadingDoc.set(field);

    const updated = await this.contractService.uploadDocumentAdmin(
      c.id,
      field,
      file,
      adminName,
      this.docMeta(),
    );

    this.uploadingDoc.set(null);
    this.expandedReplace.set(null);

    if (updated) {
      this.contract.set(updated);
      this.showToast('success', 'Documento subido correctamente');
    } else {
      this.showToast('error', 'Error al subir el documento');
    }

    input.value = '';
  }

  sendContractEmail(): void {
    const c = this.contract();
    if (!c) return;

    const email = c.client?.email ?? '';
    const link = `${window.location.origin}/contrato/${c.id}`;
    const subject = encodeURIComponent(`Contrato de Servicio Hula Hoop ${c.folio}`);
    const body = encodeURIComponent(
      `Hola ${c.client?.nombre ?? 'Cliente'},\n\n` +
      `Te enviamos el enlace para revisar, firmar digitalmente y subir tus documentos para el contrato de tu evento el día ${this.formatDate(c.fecha_evento)}:\n\n` +
      `Enlace de Firma: ${link}\n\n` +
      `Detalles del Contrato:\n` +
      `- Total del Contrato: $${c.total_contrato.toLocaleString('es-MX')} MXN\n` +
      `- Anticipo Pagado: $${c.deposito_pagado.toLocaleString('es-MX')} MXN\n` +
      `- Saldo Pendiente: $${c.saldo_pendiente.toLocaleString('es-MX')} MXN\n\n` +
      `Por favor ingresa al enlace para completar el proceso de firma de conformidad y subida de documentos.\n\n` +
      `Atentamente,\nHula Hoop Eventos`
    );

    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
  }

  sendContractWhatsapp(): void {
    const c = this.contract();
    if (!c) return;

    const phone = c.client?.telefono ?? '';
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.length === 10) {
      formattedPhone = '52' + formattedPhone;
    }

    const link = `${window.location.origin}/contrato/${c.id}`;
    const text = encodeURIComponent(
      `*Hula Hoop - Firma de Contrato*\n\n` +
      `Hola ${c.client?.nombre ?? 'Cliente'},\n\n` +
      `Te enviamos el enlace para revisar, firmar digitalmente y subir tu documentación para el contrato de tu evento el día *${this.formatDate(c.fecha_evento)}*:\n\n` +
      `🔗 *Enlace de firma:* ${link}\n\n` +
      `Detalles del Evento:\n` +
      `• Total del Contrato: $${c.total_contrato.toLocaleString('es-MX')} MXN\n` +
      `• Anticipo Pagado: $${c.deposito_pagado.toLocaleString('es-MX')} MXN\n` +
      `• Saldo Pendiente: $${c.saldo_pendiente.toLocaleString('es-MX')} MXN\n\n` +
      `Por favor ingresa al enlace para completar el proceso de firma y carga de documentos.\n\n` +
      `¡Muchas gracias!`
    );

    window.open(`https://wa.me/${formattedPhone}?text=${text}`, '_blank');
  }

  downloadContract(): void {
    const c = this.contract();
    if (!c) return;

    const win = window.open('', '_blank');
    if (!win) return;

    const quoteData = this.quote();
    const pkg = this.getContractPackage(quoteData);
    const snack = this.getContractSnack(quoteData);
    const extras = this.getContractExtras(quoteData);

    const fechaEvento = c.fecha_evento
      ? new Date(c.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' })
      : '—';
    const fechaCelebracion = c.fecha_firma
      ? new Date(c.fecha_firma + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' })
      : c.created_at
        ? new Date(c.created_at).toLocaleDateString('es-MX', { dateStyle: 'long' })
        : new Date().toLocaleDateString('es-MX', { dateStyle: 'long' });

    win.document.write(`<!DOCTYPE html><html lang="es"><head>
      <meta charset="UTF-8">
      <title>Contrato ${c.folio} — Hula Hoop</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#334155;line-height:1.6;padding:50px 60px;background:#fff;font-size:13px;text-align:justify}
        .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:35px;padding-bottom:15px;border-bottom:2px solid #e2e8f0}
        .logo{font-size:24px;font-weight:800;color:#E30D1C;letter-spacing:-0.5px}
        .title{font-size:15px;font-weight:800;text-align:center;text-transform:uppercase;margin:30px 0 20px 0;color:#1e293b}
        .section-title{font-weight:700;text-transform:uppercase;margin:20px 0 10px 0;font-size:12px;color:#0f172a}
        p{margin-bottom:12px;text-indent:24px}
        ol{margin:10px 0 15px 30px}
        ol li{margin-bottom:8px}
        .details-table{width:100%;border-collapse:collapse;margin:20px 0;font-size:12px}
        .details-table td{padding:8px 12px;border:1px solid #cbd5e1}
        .details-table td.label{font-weight:700;background:#f8fafc;width:25%}
        .signatures{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:60px;page-break-inside:avoid}
        .signature-block{text-align:center}
        .signature-line{border-top:1px solid #475569;margin-top:10px;padding-top:8px;font-size:12px;font-weight:600}
        .footer{margin-top:60px;border-top:1px solid #e2e8f0;padding-top:15px;font-size:10px;color:#94a3b8;text-align:center}
        @media print{body{padding:20px 30px}}
      </style>
    </head><body>
      <div class="header">
        <div class="logo">HULA HOOP</div>
        <div style="text-align:right">
          <div style="font-weight:700;font-size:14px">CONTRATO DE ADHESIÓN</div>
          <div style="color:#64748b;font-size:12px">FOLIO: ${c.folio}</div>
        </div>
      </div>

      <div class="title">CONTRATO DE PRESTACIÓN DE SERVICIOS PARA EVENTO SOCIAL</div>

      <p>CONTRATO DE PRESTACIÓN DE SERVICIOS QUE CELEBRAN, POR UNA PARTE, EL SALÓN DE EVENTOS HULA HOOP (EN LO SUCESIVO <strong>"EL PRESTADOR"</strong>), Y POR LA OTRA PARTE, LA PERSONA CUYOS DATOS APARECEN EN LA TABLA DE ESPECIFICACIONES DE ESTE DOCUMENTO (EN LO SUCESIVO <strong>"EL CLIENTE"</strong>), AL TENOR DE LAS SIGUIENTES DECLARACIONES Y CLÁUSULAS:</p>

      <div class="section-title">ESPECIFICACIONES DEL SERVICIO Y EVENTO</div>
      <table class="details-table">
        <tr>
          <td class="label">Cliente</td>
          <td>${c.client?.nombre ?? '—'}</td>
          <td class="label">Fecha Evento</td>
          <td>${fechaEvento}</td>
        </tr>
        <tr>
          <td class="label">Teléfono</td>
          <td>${c.client?.telefono ?? '—'}</td>
          <td class="label">Horario</td>
          <td>De ${c.hora_inicio ? this.formatTime(c.hora_inicio) : '—'} a ${c.hora_fin ? this.formatTime(c.hora_fin) : '—'}</td>
        </tr>
        <tr>
          <td class="label">Email</td>
          <td>${c.client?.email ?? '—'}</td>
          <td class="label">Paquete Contratado</td>
          <td>${pkg}</td>
        </tr>
        <tr>
          <td class="label">Merienda</td>
          <td>${snack}</td>
          <td class="label">Extras</td>
          <td>${extras}</td>
        </tr>
        <tr>
          <td class="label">Costo Renta Salón</td>
          <td>$${c.salon_renta.toLocaleString('es-MX')} MXN</td>
          <td class="label">Total Contrato</td>
          <td><strong>$${c.total_contrato.toLocaleString('es-MX')} MXN</strong></td>
        </tr>
        <tr>
          <td class="label">Anticipo Pagado</td>
          <td style="color:#16a34a;font-weight:600">$${c.deposito_pagado.toLocaleString('es-MX')} MXN</td>
          <td class="label">Saldo Pendiente</td>
          <td style="color:#dc2626;font-weight:700"><strong>$${c.saldo_pendiente.toLocaleString('es-MX')} MXN</strong></td>
        </tr>
      </table>

      <div class="section-title">DECLARACIONES</div>
      <p>I. Declara <strong>"EL PRESTADOR"</strong> ser una empresa debidamente constituida conforme a las leyes mexicanas, con facultades suficientes para obligarse en los términos de este instrumento, y contar con la infraestructura y personal calificado para la prestación del servicio objeto del presente contrato.</p>
      <p>II. Declara <strong>"EL CLIENTE"</strong>, por su propio derecho, contar con capacidad legal suficiente para contratar y obligarse en los términos del presente instrumento, reconociendo que los datos proporcionados son verídicos y vigentes.</p>

      <div class="section-title">CLÁUSULAS</div>
      <ol>
        <li><strong>PRIMERA (OBJETO):</strong> "EL PRESTADOR" se obliga a prestar el servicio de renta del salón de eventos Hula Hoop para la realización del evento social de "EL CLIENTE", de conformidad con los términos descritos en el presente contrato.</li>
        <li><strong>SEGUNDA (PRECIO Y CONDICIONES DE PAGO):</strong> "EL CLIENTE" se obliga a pagar a "EL PRESTADOR" la cantidad total señalada como "Total Contrato". Para reservar formalmente el espacio y la fecha, se requiere el anticipo detallado arriba. El saldo restante ("Saldo Pendiente") deberá ser liquidado por "EL CLIENTE" a más tardar el día de la celebración del evento, antes del inicio del mismo.</li>
        <li><strong>TERCERA (POLÍTICA DE CANCELACIÓN Y MODIFICACIÓN):</strong> Cualquier cancelación por parte de "EL CLIENTE" implicará la pérdida total del anticipo pagado, por concepto de indemnización a "EL PRESTADOR" por reserva y bloqueo de la fecha. En caso de solicitar cambio de fecha, quedará sujeto a la disponibilidad del salón y se aplicará el cargo vigente por reprogramación de eventos.</li>
        <li><strong>CUARTA (REGLAMENTO INTERNO):</strong> "EL CLIENTE" y sus invitados se obligan a observar en todo momento las normas de uso, seguridad e higiene de las instalaciones de Hula Hoop, respondiendo el cliente por cualquier daño material causado a los equipos, juguetes o infraestructura del inmueble por dolo, negligencia o mal uso.</li>
        <li><strong>QUINTA (VIGENCIA Y JURISDICCIÓN):</strong> El presente contrato surte sus efectos a partir del momento de la firma electrónica o física por ambas partes. Para la interpretación y cumplimiento de este instrumento, las partes se someten a las leyes y tribunales competentes en la materia de la localidad del establecimiento, renunciando a cualquier otra jurisdicción.</li>
      </ol>

      <p style="margin-top:20px;text-indent:0">Leído por las partes y enterados de su alcance legal, se firma por duplicado el día ${fechaCelebracion}.</p>

      <div class="signatures">
        <div class="signature-block">
          <div style="height: 60px; display: flex; align-items: flex-end; justify-content: center; font-style: italic; color: #94a3b8; font-size: 14px;">
            Hula Hoop Eventos
          </div>
          <div class="signature-line">Por EL PRESTADOR<br>HULA HOOP EVENTOS</div>
        </div>
        <div class="signature-block">
          <div style="height: 60px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; pb-1">
            ${c.firma_url ? `<img src="${c.firma_url}" style="max-height: 55px;" />` : ''}
          </div>
          <div class="signature-line">Por EL CLIENTE<br>${c.client?.nombre ?? '________________________'}</div>
          ${c.fecha_firma ? `<div style="font-size: 9px; color: #64748b; margin-top: 4px;">Firmado digitalmente el ${fechaCelebracion}</div>` : ''}
        </div>
      </div>

      <div class="footer">Este contrato fue generado por Hula Hoop · Calle Ejemplar · Tel: (55) 1234-5678 · info@hulahoop.mx</div>
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }
}
