import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { ContractService } from '../../../../core/services/contract.service';
import { ClientService } from '../../../../core/services/client.service';
import { QuoteService } from '../../../../core/services/quote.service';
import type { Contract, ContractStatus, CreateContractData } from '../../../../core/interfaces/contract';
import type { Client } from '../../../../core/interfaces/client';
import type { Quote } from '../../../../core/interfaces/quote';

type DrawerMode = 'create' | 'edit';
type Panel = 'detail' | 'payment';

const STATUS_CONFIG: Record<ContractStatus, { label: string; classes: string; dot: string }> = {
  borrador:  { label: 'Borrador',    classes: 'bg-slate-100 text-slate-600',    dot: 'bg-slate-400' },
  firmado:   { label: 'Contratado',  classes: 'bg-blue-100 text-blue-700',      dot: 'bg-blue-500' },
  liquidado: { label: 'Liquidado',   classes: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  cancelado: { label: 'Cancelado',   classes: 'bg-red-100 text-red-700',        dot: 'bg-red-400' },
};

@Component({
  selector: 'app-admin-contracts',
  templateUrl: './admin-contracts.html',
  imports: [ReactiveFormsModule, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminContracts implements OnInit {
  private readonly contractService = inject(ContractService);
  private readonly clientService   = inject(ClientService);
  private readonly quoteService    = inject(QuoteService);
  private readonly fb              = inject(FormBuilder);

  // ── Forms ────────────────────────────────────────────────────
  readonly form = this.fb.group({
    client_id:       [''],
    quote_id:        [''],
    fecha_evento:    ['', Validators.required],
    hora_inicio:     [''],
    hora_fin:        [''],
    salon_renta:     [0, [Validators.required, Validators.min(0)]],
    total_contrato:  [0, [Validators.required, Validators.min(0)]],
    deposito_pagado: [0, [Validators.min(0)]],
    estado:          ['borrador' as ContractStatus],
    notas:           [''],
  });

  readonly paymentForm = this.fb.group({
    monto:  [0, [Validators.required, Validators.min(0.01)]],
    fecha:  [this.today(), Validators.required],
    metodo: ['efectivo'],
    notas:  [''],
  });

  // ── State ────────────────────────────────────────────────────
  readonly loading         = signal(true);
  readonly saving          = signal(false);
  readonly savingPayment   = signal(false);
  readonly contracts       = signal<Contract[]>([]);
  readonly allClients      = signal<Client[]>([]);
  readonly approvedQuotes  = signal<Quote[]>([]);
  readonly statusFilter    = signal<ContractStatus | 'all'>('all');
  readonly drawerOpen      = signal(false);
  readonly drawerMode      = signal<DrawerMode>('create');
  readonly selectedContract = signal<Contract | null>(null);
  readonly activePanel     = signal<Panel>('detail');
  readonly deleteTarget    = signal<Contract | null>(null);
  readonly toast           = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  // Client selector
  readonly clientQuery        = signal('');
  readonly clientDropdownOpen = signal(false);
  readonly selectedClientName = signal('');

  // ── Computed ─────────────────────────────────────────────────
  readonly filteredContracts = computed(() => {
    const f = this.statusFilter();
    return f === 'all' ? this.contracts() : this.contracts().filter((c) => c.estado === f);
  });

  readonly clientResults = computed(() => {
    const q = this.clientQuery().toLowerCase().trim();
    if (!q) return this.allClients().slice(0, 6);
    return this.allClients()
      .filter(
        (c) =>
          c.nombre.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.telefono?.includes(q),
      )
      .slice(0, 8);
  });

  readonly saldoPendiente = computed(() => {
    const total   = +(this.form.get('total_contrato')!.value ?? 0);
    const deposito = +(this.form.get('deposito_pagado')!.value ?? 0);
    return Math.max(0, total - deposito);
  });

  readonly paymentProgress = computed(() => {
    const c = this.selectedContract();
    if (!c || c.total_contrato === 0) return 0;
    return Math.min(100, Math.round((c.deposito_pagado / c.total_contrato) * 100));
  });

  readonly statusOptions: Array<{ value: ContractStatus | 'all'; label: string }> = [
    { value: 'all',       label: 'Todos' },
    { value: 'borrador',  label: 'Borrador' },
    { value: 'firmado',   label: 'Contratado' },
    { value: 'liquidado', label: 'Liquidado' },
    { value: 'cancelado', label: 'Cancelado' },
  ];

  readonly STATUS_CONFIG = STATUS_CONFIG;

  // ── Lifecycle ────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    const [contracts, clients, quotes] = await Promise.all([
      this.contractService.getAll(),
      this.clientService.getAll(),
      this.quoteService.getAll(),
    ]);
    this.contracts.set(contracts);
    this.allClients.set(clients);
    this.approvedQuotes.set(quotes.filter((q) => q.estado === 'aprobada'));
    this.loading.set(false);
  }

  // ── Client selector ──────────────────────────────────────────
  onClientInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.clientQuery.set(val);
    this.clientDropdownOpen.set(true);
    if (!val) {
      this.form.patchValue({ client_id: '' });
      this.selectedClientName.set('');
    }
  }

  selectClient(client: Client): void {
    this.form.patchValue({ client_id: client.id });
    this.selectedClientName.set(client.nombre);
    this.clientQuery.set('');
    this.clientDropdownOpen.set(false);
  }

  clearClient(): void {
    this.form.patchValue({ client_id: '' });
    this.selectedClientName.set('');
    this.clientQuery.set('');
  }

  // ── Quote prefill ─────────────────────────────────────────────
  onQuoteSelected(event: Event): void {
    const quoteId = (event.target as HTMLSelectElement).value;
    const quote = this.approvedQuotes().find((q) => q.id === quoteId);
    if (!quote) return;

    this.form.patchValue({
      quote_id:       quote.id,
      fecha_evento:   quote.fecha_evento ?? '',
      total_contrato: quote.total,
    });

    if (quote.client_id) {
      const client = this.allClients().find((c) => c.id === quote.client_id);
      if (client) {
        this.form.patchValue({ client_id: client.id });
        this.selectedClientName.set(client.nombre);
      }
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────
  openCreate(): void {
    this.resetForm();
    this.drawerMode.set('create');
    this.selectedContract.set(null);
    this.activePanel.set('detail');
    this.drawerOpen.set(true);
  }

  openEdit(contract: Contract): void {
    this.selectedContract.set(contract);
    this.drawerMode.set('edit');
    this.activePanel.set('detail');

    this.form.patchValue({
      client_id:       contract.client_id ?? '',
      quote_id:        contract.quote_id ?? '',
      fecha_evento:    contract.fecha_evento,
      hora_inicio:     contract.hora_inicio ?? '',
      hora_fin:        contract.hora_fin ?? '',
      salon_renta:     contract.salon_renta,
      total_contrato:  contract.total_contrato,
      deposito_pagado: contract.deposito_pagado,
      estado:          contract.estado,
      notas:           contract.notas ?? '',
    });

    this.selectedClientName.set(contract.client?.nombre ?? '');
    this.clientQuery.set('');
    this.clientDropdownOpen.set(false);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.resetForm();
    this.paymentForm.reset({ fecha: this.today(), metodo: 'efectivo', monto: 0 });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const raw = this.form.getRawValue();
    const payload: CreateContractData = {
      client_id:       raw.client_id || undefined,
      quote_id:        raw.quote_id || undefined,
      fecha_evento:    raw.fecha_evento!,
      hora_inicio:     raw.hora_inicio || undefined,
      hora_fin:        raw.hora_fin || undefined,
      salon_renta:     +(raw.salon_renta ?? 0),
      total_contrato:  +(raw.total_contrato ?? 0),
      deposito_pagado: +(raw.deposito_pagado ?? 0),
      estado:          (raw.estado as ContractStatus) || 'borrador',
      notas:           raw.notas?.trim() || undefined,
    };

    let result: Contract | null = null;
    if (this.drawerMode() === 'create') {
      result = await this.contractService.create(payload);
    } else {
      result = await this.contractService.update(this.selectedContract()!.id, payload);
    }

    if (result) {
      await this.refreshContracts();
      this.closeDrawer();
      this.showToast('success', this.drawerMode() === 'create' ? 'Contrato creado' : 'Contrato actualizado');
    } else {
      this.showToast('error', 'Ocurrió un error. Intenta de nuevo.');
    }
    this.saving.set(false);
  }

  async onAddPayment(): Promise<void> {
    if (this.paymentForm.invalid || this.savingPayment()) return;
    const contract = this.selectedContract();
    if (!contract) return;

    this.savingPayment.set(true);
    const raw = this.paymentForm.getRawValue();

    const ok = await this.contractService.addPayment(contract.id, {
      monto:  +(raw.monto ?? 0),
      fecha:  raw.fecha!,
      metodo: raw.metodo as 'efectivo' | 'tarjeta' | 'transferencia',
      notas:  raw.notas?.trim() || null,
    });

    if (ok) {
      const updated = await this.contractService.getById(contract.id);
      if (updated) {
        this.selectedContract.set(updated);
        this.contracts.update((list) =>
          list.map((c) => (c.id === updated.id ? updated : c)),
        );
      }
      this.paymentForm.reset({ fecha: this.today(), metodo: 'efectivo', monto: 0 });
      this.showToast('success', 'Pago registrado');
    } else {
      this.showToast('error', 'No se pudo registrar el pago');
    }
    this.savingPayment.set(false);
  }

  confirmDelete(contract: Contract): void { this.deleteTarget.set(contract); }
  cancelDelete(): void                    { this.deleteTarget.set(null); }

  async executeDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    const ok = await this.contractService.delete(target.id);
    if (ok) {
      this.contracts.update((list) => list.filter((c) => c.id !== target.id));
      this.showToast('success', 'Contrato eliminado');
    } else {
      this.showToast('error', 'No se pudo eliminar el contrato');
    }
    this.deleteTarget.set(null);
  }

  // ── Helpers ──────────────────────────────────────────────────
  setStatusFilter(val: ContractStatus | 'all'): void { this.statusFilter.set(val); }
  setActivePanel(p: Panel): void                     { this.activePanel.set(p); }

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }

  private async refreshContracts(): Promise<void> {
    this.contracts.set(await this.contractService.getAll());
  }

  private resetForm(): void {
    this.form.reset({
      client_id: '', quote_id: '', fecha_evento: '',
      hora_inicio: '', hora_fin: '', salon_renta: 0,
      total_contrato: 0, deposito_pagado: 0,
      estado: 'borrador', notas: '',
    });
    this.selectedClientName.set('');
    this.clientQuery.set('');
    this.clientDropdownOpen.set(false);
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 3500);
  }
}
