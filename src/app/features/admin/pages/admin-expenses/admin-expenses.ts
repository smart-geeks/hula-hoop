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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { ExpenseService } from '../../../../core/services/expense.service';
import { ContractService } from '../../../../core/services/contract.service';
import { SupplierService } from '../../../../core/services/supplier.service';
import type { AdminExpense, CreateExpenseData } from '../../../../core/interfaces/expense';
import { EXPENSE_CATEGORIES } from '../../../../core/interfaces/expense';
import type { Contract } from '../../../../core/interfaces/contract';
import type { Supplier } from '../../../../core/interfaces/supplier';

type DrawerMode = 'create' | 'edit';

@Component({
  selector: 'app-admin-expenses',
  templateUrl: './admin-expenses.html',
  imports: [ReactiveFormsModule, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminExpenses implements OnInit {
  private readonly cdr             = inject(ChangeDetectorRef);
  private readonly ngZone           = inject(NgZone);
  private readonly expenseService  = inject(ExpenseService);
  private readonly contractService = inject(ContractService);
  private readonly supplierService = inject(SupplierService);
  private readonly fb              = inject(FormBuilder);

  readonly form = this.fb.group({
    categoria:   ['', Validators.required],
    descripcion: ['', [Validators.required, Validators.minLength(3)]],
    monto:       [0, [Validators.required, Validators.min(0.01)]],
    fecha:       [this.today(), Validators.required],
    contract_id: [''],
    supplier_id: [''],
    notas:       [''],
  });

  readonly loading         = signal(true);
  readonly saving          = signal(false);
  readonly expenses        = signal<AdminExpense[]>([]);
  readonly contracts       = signal<Contract[]>([]);
  readonly suppliers       = signal<Supplier[]>([]);
  readonly categoryFilter  = signal<string>('all');
  readonly searchQuery     = signal('');
  readonly drawerOpen      = signal(false);
  readonly drawerMode      = signal<DrawerMode>('create');
  readonly selectedExpense = signal<AdminExpense | null>(null);
  readonly deleteTarget    = signal<AdminExpense | null>(null);
  readonly toast           = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  readonly categories = EXPENSE_CATEGORIES;

  readonly filteredExpenses = computed(() => {
    const cat = this.categoryFilter();
    const q   = this.searchQuery().toLowerCase().trim();
    let list  = this.expenses();

    if (cat !== 'all') list = list.filter((e) => e.categoria === cat);
    if (q) list = list.filter(
      (e) => e.descripcion.toLowerCase().includes(q) || e.categoria.toLowerCase().includes(q),
    );
    return list;
  });

  readonly totalFiltered = computed(() =>
    this.filteredExpenses().reduce((s, e) => s + e.monto, 0),
  );

  async ngOnInit(): Promise<void> {
    const [expenses, contracts, suppliers] = await Promise.all([
      this.expenseService.getAll(),
      this.contractService.getAll(),
      this.supplierService.getAll(),
    ]);
    this.ngZone.run(() => {
      this.expenses.set(expenses);
      this.contracts.set(contracts.filter((c) => c.estado !== 'cancelado'));
      this.suppliers.set(suppliers);
      this.loading.set(false);
    });
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  openCreate(): void {
    this.form.reset({ fecha: this.today(), monto: 0 });
    this.selectedExpense.set(null);
    this.drawerMode.set('create');
    this.drawerOpen.set(true);
  }

  openEdit(expense: AdminExpense): void {
    this.selectedExpense.set(expense);
    this.drawerMode.set('edit');
    this.form.patchValue({
      categoria:   expense.categoria,
      descripcion: expense.descripcion,
      monto:       expense.monto,
      fecha:       expense.fecha,
      contract_id: expense.contract_id ?? '',
      supplier_id: expense.supplier_id ?? '',
      notas:       '',
    });
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.form.reset({ fecha: this.today(), monto: 0 });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const raw = this.form.getRawValue();
    const payload: CreateExpenseData = {
      categoria:   raw.categoria!,
      descripcion: raw.descripcion!.trim(),
      monto:       +(raw.monto ?? 0),
      fecha:       raw.fecha!,
      contract_id: raw.contract_id || undefined,
      supplier_id: raw.supplier_id || undefined,
    };

    let result: AdminExpense | null = null;
    if (this.drawerMode() === 'create') {
      result = await this.expenseService.create(payload);
    } else {
      result = await this.expenseService.update(this.selectedExpense()!.id, payload);
    }

    if (result) {
      const all = await this.expenseService.getAll();
      this.expenses.set(all);
      this.closeDrawer();
      this.showToast('success', this.drawerMode() === 'create' ? 'Gasto registrado' : 'Gasto actualizado');
    } else {
      this.showToast('error', 'Ocurrió un error. Intenta de nuevo.');
    }
    this.saving.set(false);
  }

  confirmDelete(expense: AdminExpense): void { this.deleteTarget.set(expense); }
  cancelDelete(): void                       { this.deleteTarget.set(null); }

  async executeDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    const ok = await this.expenseService.delete(target.id);
    if (ok) {
      this.expenses.update((list) => list.filter((e) => e.id !== target.id));
      this.showToast('success', 'Gasto eliminado');
    } else {
      this.showToast('error', 'No se pudo eliminar');
    }
    this.deleteTarget.set(null);
  }

  private today(): string { return new Date().toISOString().split('T')[0]; }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 3500);
  }
}
