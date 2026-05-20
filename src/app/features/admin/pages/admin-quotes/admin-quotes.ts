import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { QuoteService } from '../../../../core/services/quote.service';
import { ClientService } from '../../../../core/services/client.service';
import { ContractService } from '../../../../core/services/contract.service';
import type { Quote, QuoteStatus } from '../../../../core/interfaces/quote';
import type { Client } from '../../../../core/interfaces/client';

type DrawerMode = 'create' | 'edit';

const STATUS_CONFIG: Record<QuoteStatus, { label: string; classes: string }> = {
  borrador:  { label: 'Borrador',  classes: 'bg-slate-100 text-slate-600' },
  enviada:   { label: 'Enviada',   classes: 'bg-blue-100 text-blue-700' },
  aprobada:  { label: 'Aprobada',  classes: 'bg-emerald-100 text-emerald-700' },
  rechazada: { label: 'Rechazada', classes: 'bg-red-100 text-red-700' },
  vencida:   { label: 'Vencida',   classes: 'bg-amber-100 text-amber-700' },
};

@Component({
  selector: 'app-admin-quotes',
  templateUrl: './admin-quotes.html',
  imports: [ReactiveFormsModule, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminQuotes implements OnInit {
  private readonly quoteService = inject(QuoteService);
  private readonly clientService = inject(ClientService);
  private readonly contractService = inject(ContractService);
  private readonly fb = inject(FormBuilder);

  // ── Form ────────────────────────────────────────────────────
  readonly form = this.fb.group({
    client_id:       [''],
    fecha:           [this.today(), Validators.required],
    fecha_evento:    [''],
    estado:          ['borrador' as QuoteStatus],
    descuento:       [0, [Validators.min(0)]],
    notas:           [''],
    items: this.fb.array([this.buildItemGroup()]),
  });

  private readonly _formValues = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.value)),
    { initialValue: this.form.value },
  );

  readonly subtotal = computed(() =>
    (this._formValues()?.items ?? []).reduce(
      (s, it) => s + (+(it?.cantidad ?? 0)) * (+(it?.precio_unitario ?? 0)),
      0,
    ),
  );

  readonly total = computed(() =>
    Math.max(0, this.subtotal() - +(this._formValues()?.descuento ?? 0)),
  );

  // ── State ────────────────────────────────────────────────────
  readonly loading        = signal(true);
  readonly saving         = signal(false);
  readonly converting     = signal(false);
  readonly quotes         = signal<Quote[]>([]);
  readonly allClients     = signal<Client[]>([]);
  readonly statusFilter   = signal<QuoteStatus | 'all'>('all');
  readonly drawerOpen     = signal(false);
  readonly drawerMode     = signal<DrawerMode>('create');
  readonly selectedQuote  = signal<Quote | null>(null);
  readonly deleteTarget   = signal<Quote | null>(null);
  readonly toast          = signal<{ type: 'success' | 'error'; message: string } | null>(null);
  readonly itemCount      = signal(1);

  // Client selector state
  readonly clientQuery        = signal('');
  readonly clientDropdownOpen = signal(false);
  readonly selectedClientName = signal('');

  // ── Computed ─────────────────────────────────────────────────
  readonly filteredQuotes = computed(() => {
    const f = this.statusFilter();
    return f === 'all' ? this.quotes() : this.quotes().filter((q) => q.estado === f);
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

  readonly statusOptions: Array<{ value: QuoteStatus | 'all'; label: string }> = [
    { value: 'all',       label: 'Todos' },
    { value: 'borrador',  label: 'Borrador' },
    { value: 'enviada',   label: 'Enviada' },
    { value: 'aprobada',  label: 'Aprobada' },
    { value: 'rechazada', label: 'Rechazada' },
    { value: 'vencida',   label: 'Vencida' },
  ];

  readonly STATUS_CONFIG = STATUS_CONFIG;

  get items(): FormArray { return this.form.get('items') as FormArray; }

  // ── Lifecycle ────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    const [quotes, clients] = await Promise.all([
      this.quoteService.getAll(),
      this.clientService.getAll(),
    ]);
    this.quotes.set(quotes);
    this.allClients.set(clients);
    this.loading.set(false);
  }

  // ── Form helpers ─────────────────────────────────────────────
  private buildItemGroup() {
    return this.fb.group({
      descripcion:     ['', Validators.required],
      cantidad:        [1,  [Validators.required, Validators.min(0.01)]],
      precio_unitario: [0,  [Validators.required, Validators.min(0)]],
    });
  }

  addItem(): void {
    this.items.push(this.buildItemGroup());
    this.itemCount.update((n) => n + 1);
  }

  removeItem(i: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(i);
      this.itemCount.update((n) => n - 1);
    }
  }

  getItemSubtotal(i: number): number {
    const v = this.items.at(i).value;
    return (+(v.cantidad ?? 0)) * (+(v.precio_unitario ?? 0));
  }

  private today(): string {
    return new Date().toISOString().split('T')[0];
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

  // ── CRUD ────────────────────────────────────────────────────
  openCreate(): void {
    this.resetForm();
    this.drawerMode.set('create');
    this.selectedQuote.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(quote: Quote): void {
    this.selectedQuote.set(quote);
    this.drawerMode.set('edit');

    while (this.items.length > 0) this.items.removeAt(0);
    const itemsData = quote.items ?? [];
    if (itemsData.length === 0) {
      this.items.push(this.buildItemGroup());
    } else {
      itemsData.forEach((it) => {
        this.items.push(
          this.fb.group({
            descripcion:     [it.descripcion,     Validators.required],
            cantidad:        [it.cantidad,        [Validators.required, Validators.min(0.01)]],
            precio_unitario: [it.precio_unitario, [Validators.required, Validators.min(0)]],
          }),
        );
      });
    }
    this.itemCount.set(this.items.length);

    this.form.patchValue({
      client_id:    quote.client_id ?? '',
      fecha:        quote.fecha,
      fecha_evento: quote.fecha_evento ?? '',
      estado:       quote.estado,
      descuento:    quote.descuento,
      notas:        quote.notas ?? '',
    });

    this.selectedClientName.set(quote.client?.nombre ?? '');
    this.clientQuery.set('');
    this.clientDropdownOpen.set(false);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.resetForm();
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const raw = this.form.getRawValue();
    const payload = {
      client_id:    raw.client_id || undefined,
      fecha:        raw.fecha!,
      fecha_evento: raw.fecha_evento || undefined,
      estado:       (raw.estado as QuoteStatus) || 'borrador',
      subtotal:     this.subtotal(),
      descuento:    +(raw.descuento ?? 0),
      total:        this.total(),
      notas:        raw.notas?.trim() || undefined,
      items:        (raw.items ?? []).map((it) => ({
        descripcion:     it.descripcion!.trim(),
        cantidad:        +(it.cantidad ?? 1),
        precio_unitario: +(it.precio_unitario ?? 0),
      })),
    };

    let result: Quote | null = null;
    if (this.drawerMode() === 'create') {
      result = await this.quoteService.create(payload);
    } else {
      result = await this.quoteService.updateFull(this.selectedQuote()!.id, payload);
    }

    if (result) {
      await this.refreshQuotes();
      this.closeDrawer();
      this.showToast('success', this.drawerMode() === 'create' ? 'Cotización creada' : 'Cotización actualizada');
    } else {
      this.showToast('error', 'Ocurrió un error. Intenta de nuevo.');
    }
    this.saving.set(false);
  }

  async changeStatus(quote: Quote, estado: QuoteStatus): Promise<void> {
    const ok = await this.quoteService.updateStatus(quote.id, estado);
    if (ok) {
      this.quotes.update((list) =>
        list.map((q) => (q.id === quote.id ? { ...q, estado } : q)),
      );
      this.showToast('success', `Estado cambiado a ${STATUS_CONFIG[estado].label}`);
    }
  }

  async convertToContract(quote: Quote): Promise<void> {
    if (this.converting()) return;
    this.converting.set(true);

    const result = await this.contractService.create({
      quote_id:      quote.id,
      client_id:     quote.client_id ?? undefined,
      fecha_evento:  quote.fecha_evento ?? new Date().toISOString().split('T')[0],
      salon_renta:   0,
      total_contrato: quote.total,
      deposito_pagado: 0,
      estado:        'borrador',
    });

    if (result) {
      this.showToast('success', `Contrato ${result.folio} creado correctamente`);
    } else {
      this.showToast('error', 'No se pudo crear el contrato');
    }
    this.converting.set(false);
  }

  confirmDelete(quote: Quote): void { this.deleteTarget.set(quote); }
  cancelDelete(): void              { this.deleteTarget.set(null); }

  async executeDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    const ok = await this.quoteService.delete(target.id);
    if (ok) {
      this.quotes.update((list) => list.filter((q) => q.id !== target.id));
      this.showToast('success', 'Cotización eliminada');
    } else {
      this.showToast('error', 'No se pudo eliminar la cotización');
    }
    this.deleteTarget.set(null);
  }

  // ── Helpers ──────────────────────────────────────────────────
  setStatusFilter(val: QuoteStatus | 'all'): void { this.statusFilter.set(val); }

  private async refreshQuotes(): Promise<void> {
    const quotes = await this.quoteService.getAll();
    this.quotes.set(quotes);
  }

  private resetForm(): void {
    while (this.items.length > 0) this.items.removeAt(0);
    this.items.push(this.buildItemGroup());
    this.itemCount.set(1);
    this.form.reset({
      client_id: '', fecha: this.today(), fecha_evento: '',
      estado: 'borrador', descuento: 0, notas: '',
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
