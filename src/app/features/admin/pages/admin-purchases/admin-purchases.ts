import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { SupplierService } from '../../../../core/services/supplier.service';
import { ContractService } from '../../../../core/services/contract.service';
import type { Purchase, PurchaseStatus, CreatePurchaseData } from '../../../../core/interfaces/purchase';
import type { Supplier } from '../../../../core/interfaces/supplier';
import type { Contract } from '../../../../core/interfaces/contract';

type DrawerMode = 'create' | 'edit';

const STATUS_CONFIG: Record<PurchaseStatus, { label: string; classes: string }> = {
  pendiente: { label: 'Pendiente', classes: 'bg-amber-100 text-amber-700' },
  recibida:  { label: 'Recibida',  classes: 'bg-emerald-100 text-emerald-700' },
  cancelada: { label: 'Cancelada', classes: 'bg-red-100 text-red-700' },
};

@Component({
  selector: 'app-admin-purchases',
  templateUrl: './admin-purchases.html',
  imports: [ReactiveFormsModule, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPurchases {
  private readonly purchaseService = inject(PurchaseService);
  private readonly supplierService = inject(SupplierService);
  private readonly contractService = inject(ContractService);
  private readonly fb              = inject(FormBuilder);

  readonly form = this.fb.group({
    supplier_id: [''],
    contract_id: [''],
    fecha:       [this.today(), Validators.required],
    estado:      ['pendiente' as PurchaseStatus],
    notas:       [''],
    items: this.fb.array([this.buildItemGroup()]),
  });

  private readonly _formValues = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.value)),
    { initialValue: this.form.value },
  );

  readonly total = computed(() =>
    (this._formValues()?.items ?? []).reduce(
      (s, it) => s + (+(it?.cantidad ?? 0)) * (+(it?.precio_unitario ?? 0)),
      0,
    ),
  );

  readonly loading          = signal(true);
  readonly saving           = signal(false);
  readonly purchases        = signal<Purchase[]>([]);
  readonly suppliers        = signal<Supplier[]>([]);
  readonly contracts        = signal<Contract[]>([]);
  readonly statusFilter     = signal<PurchaseStatus | 'all'>('all');
  readonly drawerOpen       = signal(false);
  readonly drawerMode       = signal<DrawerMode>('create');
  readonly selectedPurchase = signal<Purchase | null>(null);
  readonly deleteTarget     = signal<Purchase | null>(null);
  readonly toast            = signal<{ type: 'success' | 'error'; message: string } | null>(null);
  readonly itemCount        = signal(1);

  readonly filteredPurchases = computed(() => {
    const f = this.statusFilter();
    return f === 'all' ? this.purchases() : this.purchases().filter((p) => p.estado === f);
  });

  readonly statusOptions: Array<{ value: PurchaseStatus | 'all'; label: string }> = [
    { value: 'all',       label: 'Todos' },
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'recibida',  label: 'Recibida' },
    { value: 'cancelada', label: 'Cancelada' },
  ];

  readonly STATUS_CONFIG = STATUS_CONFIG;

  get items(): FormArray { return this.form.get('items') as FormArray; }

  constructor() {
    this.loadAll();
  }

  private async loadAll(): Promise<void> {
    const [purchases, suppliers, contracts] = await Promise.all([
      this.purchaseService.getAll(),
      this.supplierService.getAll(),
      this.contractService.getAll(),
    ]);
    this.purchases.set(purchases);
    this.suppliers.set(suppliers);
    this.contracts.set(contracts.filter((c) => c.estado !== 'cancelado'));
    this.loading.set(false);
  }

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

  openCreate(): void {
    this.resetForm();
    this.drawerMode.set('create');
    this.selectedPurchase.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(purchase: Purchase): void {
    this.selectedPurchase.set(purchase);
    this.drawerMode.set('edit');

    while (this.items.length > 0) this.items.removeAt(0);
    const itemsData = purchase.items ?? [];
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
      supplier_id: purchase.supplier_id ?? '',
      contract_id: purchase.contract_id ?? '',
      fecha:       purchase.fecha,
      estado:      purchase.estado,
      notas:       purchase.notas ?? '',
    });
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
    const payload: CreatePurchaseData = {
      supplier_id: raw.supplier_id || undefined,
      contract_id: raw.contract_id || undefined,
      fecha:       raw.fecha!,
      total:       this.total(),
      estado:      (raw.estado as PurchaseStatus) || 'pendiente',
      notas:       raw.notas?.trim() || undefined,
      items:       (raw.items ?? []).map((it) => ({
        descripcion:     it.descripcion!.trim(),
        cantidad:        +(it.cantidad ?? 1),
        precio_unitario: +(it.precio_unitario ?? 0),
      })),
    };

    let result: Purchase | null = null;
    if (this.drawerMode() === 'create') {
      result = await this.purchaseService.create(payload);
    } else {
      result = await this.purchaseService.updateFull(this.selectedPurchase()!.id, payload);
    }

    if (result) {
      const all = await this.purchaseService.getAll();
      this.purchases.set(all);
      this.closeDrawer();
      this.showToast('success', this.drawerMode() === 'create' ? 'Compra creada' : 'Compra actualizada');
    } else {
      this.showToast('error', 'Ocurrió un error. Intenta de nuevo.');
    }
    this.saving.set(false);
  }

  confirmDelete(purchase: Purchase): void { this.deleteTarget.set(purchase); }
  cancelDelete(): void                    { this.deleteTarget.set(null); }

  async executeDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    const ok = await this.purchaseService.delete(target.id);
    if (ok) {
      this.purchases.update((list) => list.filter((p) => p.id !== target.id));
      this.showToast('success', 'Compra eliminada');
    } else {
      this.showToast('error', 'No se pudo eliminar');
    }
    this.deleteTarget.set(null);
  }

  setStatusFilter(val: PurchaseStatus | 'all'): void { this.statusFilter.set(val); }

  private today(): string { return new Date().toISOString().split('T')[0]; }

  private resetForm(): void {
    while (this.items.length > 0) this.items.removeAt(0);
    this.items.push(this.buildItemGroup());
    this.itemCount.set(1);
    this.form.reset({ supplier_id: '', contract_id: '', fecha: this.today(), estado: 'pendiente', notas: '' });
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 3500);
  }
}
