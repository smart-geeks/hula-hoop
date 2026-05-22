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
import { CurrencyPipe } from '@angular/common';
import { InventoryService } from '../../../../core/services/inventory.service';
import type { InventoryItem, MovementType } from '../../../../core/interfaces/inventory';
import { INVENTORY_CATEGORIES } from '../../../../core/interfaces/inventory';

type DrawerMode = 'create' | 'edit';
type ActivePanel = 'items' | 'movement';

const UNIT_OPTIONS = ['pieza', 'kg', 'litro', 'caja', 'paquete', 'metro', 'par', 'juego'];

@Component({
  selector: 'app-admin-inventory',
  templateUrl: './admin-inventory.html',
  imports: [ReactiveFormsModule, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminInventory implements OnInit {
  private readonly cdr             = inject(ChangeDetectorRef);
  private readonly inventoryService = inject(InventoryService);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.group({
    nombre:       ['', [Validators.required, Validators.minLength(2)]],
    sku:          [''],
    categoria:    [''],
    unidad:       ['pieza'],
    stock_actual: [0, [Validators.min(0)]],
    stock_minimo: [0, [Validators.min(0)]],
    precio_costo: [0, [Validators.min(0)]],
    precio_venta: [0, [Validators.min(0)]],
    activo:       [true],
  });

  readonly movementForm = this.fb.group({
    tipo:     ['entrada' as MovementType, Validators.required],
    cantidad: [1, [Validators.required, Validators.min(0.01)]],
    motivo:   [''],
  });

  readonly loading          = signal(true);
  readonly saving           = signal(false);
  readonly savingMovement   = signal(false);
  readonly items            = signal<InventoryItem[]>([]);
  readonly searchQuery      = signal('');
  readonly categoryFilter   = signal('all');
  readonly showInactive     = signal(false);
  readonly activePanel      = signal<ActivePanel>('items');
  readonly drawerOpen       = signal(false);
  readonly drawerMode       = signal<DrawerMode>('create');
  readonly selectedItem     = signal<InventoryItem | null>(null);
  readonly deleteTarget     = signal<InventoryItem | null>(null);
  readonly toast            = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  readonly categories = INVENTORY_CATEGORIES;
  readonly unitOptions = UNIT_OPTIONS;

  readonly filteredItems = computed(() => {
    const q   = this.searchQuery().toLowerCase().trim();
    const cat = this.categoryFilter();
    let list  = this.items();

    if (cat !== 'all') list = list.filter((i) => i.categoria === cat);
    if (q) list = list.filter(
      (i) => i.nombre.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q),
    );
    return list;
  });

  readonly lowStockCount = computed(() =>
    this.items().filter((i) => i.stock_actual <= i.stock_minimo && i.activo).length,
  );

  async ngOnInit(): Promise<void> {
    await this.loadItems();
  }

  private async loadItems(): Promise<void> {
    this.loading.set(true);
    const data = await this.inventoryService.getAll(this.showInactive());
    this.items.set(data);
    this.loading.set(false);
    this.cdr.markForCheck();
  }

  async toggleShowInactive(): Promise<void> {
    this.showInactive.update((v) => !v);
    await this.loadItems();
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  openCreate(): void {
    this.form.reset({ unidad: 'pieza', activo: true, stock_actual: 0, stock_minimo: 0, precio_costo: 0, precio_venta: 0 });
    this.selectedItem.set(null);
    this.drawerMode.set('create');
    this.activePanel.set('items');
    this.drawerOpen.set(true);
  }

  openEdit(item: InventoryItem): void {
    this.selectedItem.set(item);
    this.drawerMode.set('edit');
    this.activePanel.set('items');
    this.form.patchValue({
      nombre:       item.nombre,
      sku:          item.sku ?? '',
      categoria:    item.categoria ?? '',
      unidad:       item.unidad,
      stock_actual: item.stock_actual,
      stock_minimo: item.stock_minimo,
      precio_costo: item.precio_costo,
      precio_venta: item.precio_venta,
      activo:       item.activo,
    });
    this.movementForm.reset({ tipo: 'entrada', cantidad: 1, motivo: '' });
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.form.reset({ unidad: 'pieza', activo: true });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const raw = this.form.getRawValue();
    const payload = {
      nombre:       raw.nombre!.trim(),
      sku:          raw.sku?.trim() || undefined,
      categoria:    raw.categoria?.trim() || undefined,
      unidad:       raw.unidad || 'pieza',
      stock_actual: +(raw.stock_actual ?? 0),
      stock_minimo: +(raw.stock_minimo ?? 0),
      precio_costo: +(raw.precio_costo ?? 0),
      precio_venta: +(raw.precio_venta ?? 0),
      activo:       raw.activo ?? true,
    };

    let result: InventoryItem | null = null;
    if (this.drawerMode() === 'create') {
      result = await this.inventoryService.create(payload);
    } else {
      result = await this.inventoryService.update(this.selectedItem()!.id, payload);
    }

    if (result) {
      await this.loadItems();
      this.closeDrawer();
      this.showToast('success', this.drawerMode() === 'create' ? 'Artículo creado' : 'Artículo actualizado');
    } else {
      this.showToast('error', 'Ocurrió un error. Intenta de nuevo.');
    }
    this.saving.set(false);
  }

  async onRegisterMovement(): Promise<void> {
    if (this.movementForm.invalid || this.savingMovement()) return;
    const item = this.selectedItem();
    if (!item) return;

    this.savingMovement.set(true);
    const raw = this.movementForm.getRawValue();

    const ok = await this.inventoryService.registerMovement({
      item_id:  item.id,
      tipo:     raw.tipo as MovementType,
      cantidad: +(raw.cantidad ?? 1),
      motivo:   raw.motivo?.trim() || undefined,
    });

    if (ok) {
      const updated = await this.inventoryService.getById(item.id);
      if (updated) {
        this.selectedItem.set(updated);
        this.items.update((list) => list.map((i) => (i.id === updated.id ? updated : i)));
      }
      this.movementForm.reset({ tipo: 'entrada', cantidad: 1, motivo: '' });
      this.showToast('success', 'Movimiento registrado');
    } else {
      this.showToast('error', 'No se pudo registrar el movimiento');
    }
    this.savingMovement.set(false);
  }

  async deleteItem(item: InventoryItem): Promise<void> {
    const ok = await this.inventoryService.update(item.id, { activo: false });
    if (ok) {
      this.items.update((list) => list.filter((i) => i.id !== item.id));
      this.showToast('success', 'Artículo desactivado');
    }
    this.deleteTarget.set(null);
  }

  confirmDelete(item: InventoryItem): void { this.deleteTarget.set(item); }
  cancelDelete(): void                     { this.deleteTarget.set(null); }
  setActivePanel(p: ActivePanel): void     { this.activePanel.set(p); }

  isLowStock(item: InventoryItem): boolean {
    return item.stock_minimo > 0 && item.stock_actual <= item.stock_minimo;
  }

  getStockClass(item: InventoryItem): string {
    if (this.isLowStock(item)) return 'text-red-600 font-bold';
    if (item.stock_actual <= item.stock_minimo * 1.5) return 'text-amber-600 font-semibold';
    return 'text-emerald-600 font-semibold';
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 3500);
  }
}
