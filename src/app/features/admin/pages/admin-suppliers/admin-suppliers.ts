import {
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupplierService } from '../../../../core/services/supplier.service';
import type { Supplier } from '../../../../core/interfaces/supplier';
import { SUPPLIER_CATEGORIES } from '../../../../core/interfaces/supplier';

type DrawerMode = 'create' | 'edit';

const CATEGORY_COLORS: Record<string, string> = {
  'Catering':            'bg-amber-100 text-amber-700',
  'Decoración':          'bg-pink-100 text-pink-700',
  'Audio y Video':       'bg-purple-100 text-purple-700',
  'Fotografía':          'bg-blue-100 text-blue-700',
  'Entretenimiento':     'bg-lime-100 text-lime-700',
  'Mobiliario':          'bg-orange-100 text-orange-700',
  'Limpieza':            'bg-cyan-100 text-cyan-700',
  'Seguridad':           'bg-slate-100 text-slate-700',
  'Flores':              'bg-rose-100 text-rose-700',
  'Pasteles':            'bg-yellow-100 text-yellow-700',
};

@Component({
  selector: 'app-admin-suppliers',
  templateUrl: './admin-suppliers.html',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSuppliers implements OnInit {
  private readonly cdr             = inject(ChangeDetectorRef);
  private readonly supplierService = inject(SupplierService);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.group({
    nombre:    ['', [Validators.required, Validators.minLength(2)]],
    categoria: [''],
    contacto:  [''],
    telefono:  [''],
    email:     ['', [Validators.email]],
    notas:     [''],
    activo:    [true],
  });

  readonly loading           = signal(true);
  readonly saving            = signal(false);
  readonly suppliers         = signal<Supplier[]>([]);
  readonly showInactive      = signal(false);
  readonly searchQuery       = signal('');
  readonly drawerOpen        = signal(false);
  readonly drawerMode        = signal<DrawerMode>('create');
  readonly selectedSupplier  = signal<Supplier | null>(null);
  readonly deleteTarget      = signal<Supplier | null>(null);
  readonly toast             = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  readonly categories = SUPPLIER_CATEGORIES;
  readonly CATEGORY_COLORS = CATEGORY_COLORS;

  readonly filteredSuppliers = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const list = this.suppliers();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.nombre.toLowerCase().includes(q) ||
        s.categoria?.toLowerCase().includes(q) ||
        s.telefono?.includes(q),
    );
  });

  async ngOnInit(): Promise<void> {
    await this.loadSuppliers();
  }

  private async loadSuppliers(): Promise<void> {
    this.loading.set(true);
    const data = await this.supplierService.getAll(this.showInactive());
    this.suppliers.set(data);
    this.loading.set(false);
    this.cdr.markForCheck();
  }

  async toggleShowInactive(): Promise<void> {
    this.showInactive.update((v) => !v);
    await this.loadSuppliers();
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  openCreate(): void {
    this.form.reset({ activo: true });
    this.selectedSupplier.set(null);
    this.drawerMode.set('create');
    this.drawerOpen.set(true);
  }

  openEdit(supplier: Supplier): void {
    this.selectedSupplier.set(supplier);
    this.drawerMode.set('edit');
    this.form.patchValue({
      nombre:    supplier.nombre,
      categoria: supplier.categoria ?? '',
      contacto:  supplier.contacto ?? '',
      telefono:  supplier.telefono ?? '',
      email:     supplier.email ?? '',
      notas:     supplier.notas ?? '',
      activo:    supplier.activo,
    });
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.form.reset({ activo: true });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const raw = this.form.getRawValue();
    const payload = {
      nombre:    raw.nombre!.trim(),
      categoria: raw.categoria?.trim() || undefined,
      contacto:  raw.contacto?.trim() || undefined,
      telefono:  raw.telefono?.trim() || undefined,
      email:     raw.email?.trim() || undefined,
      notas:     raw.notas?.trim() || undefined,
      activo:    raw.activo ?? true,
    };

    let result: Supplier | null = null;
    if (this.drawerMode() === 'create') {
      result = await this.supplierService.create(payload);
    } else {
      result = await this.supplierService.update(this.selectedSupplier()!.id, payload);
    }

    if (result) {
      await this.loadSuppliers();
      this.closeDrawer();
      this.showToast('success', this.drawerMode() === 'create' ? 'Proveedor creado' : 'Proveedor actualizado');
    } else {
      this.showToast('error', 'Ocurrió un error. Intenta de nuevo.');
    }
    this.saving.set(false);
  }

  async toggleActive(supplier: Supplier): Promise<void> {
    const ok = await this.supplierService.toggleActive(supplier.id, !supplier.activo);
    if (ok) {
      this.suppliers.update((list) =>
        list.map((s) => (s.id === supplier.id ? { ...s, activo: !s.activo } : s)),
      );
    }
  }

  confirmDelete(supplier: Supplier): void { this.deleteTarget.set(supplier); }
  cancelDelete(): void                    { this.deleteTarget.set(null); }

  async executeDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    const ok = await this.supplierService.delete(target.id);
    if (ok) {
      this.suppliers.update((list) => list.filter((s) => s.id !== target.id));
      this.showToast('success', 'Proveedor eliminado');
    } else {
      this.showToast('error', 'No se pudo eliminar');
    }
    this.deleteTarget.set(null);
  }

  getCategoryClass(cat: string | null): string {
    return cat ? (CATEGORY_COLORS[cat] ?? 'bg-slate-100 text-slate-600') : 'bg-slate-100 text-slate-500';
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 3500);
  }
}
