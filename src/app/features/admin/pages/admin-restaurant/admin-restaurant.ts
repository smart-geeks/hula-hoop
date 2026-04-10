import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { FloatLabelModule } from 'primeng/floatlabel';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { RestaurantItemService } from '../../../../core/services/restaurant-item.service';
import type { RestaurantItem } from '../../../../core/interfaces/restaurant-item';

@Component({
  selector: 'app-admin-restaurant',
  templateUrl: './admin-restaurant.html',
  imports: [
    ReactiveFormsModule,
    TableModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    FloatLabelModule,
    TagModule,
    ToggleSwitchModule,
    ConfirmDialogModule,
    ToastModule,
    TooltipModule,
    CurrencyMxnPipe,
  ],
  providers: [ConfirmationService, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminRestaurant {
  private readonly restaurantItemService = inject(RestaurantItemService);
  private readonly fb = inject(FormBuilder);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  readonly items = signal<RestaurantItem[]>([]);
  readonly loading = signal(true);
  readonly dialogVisible = signal(false);
  readonly editingItem = signal<RestaurantItem | null>(null);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    category: ['', Validators.required],
    name: ['', Validators.required],
    description: [''],
    price_cents: [0, [Validators.required, Validators.min(0)]],
    is_active: [true],
    sort_order: [0],
  });

  constructor() {
    this.loadItems();
  }

  async loadItems(): Promise<void> {
    this.loading.set(true);
    const data = await this.restaurantItemService.getAllItems();
    this.items.set(data);
    this.loading.set(false);
  }

  openNew(): void {
    this.editingItem.set(null);
    this.form.reset({ category: '', name: '', description: '', price_cents: 0, is_active: true, sort_order: 0 });
    this.dialogVisible.set(true);
  }

  openEdit(item: RestaurantItem): void {
    this.editingItem.set(item);
    this.form.patchValue({
      category: item.category,
      name: item.name,
      description: item.description ?? '',
      price_cents: item.price_cents / 100, // Convert centavos → pesos for display
      is_active: item.is_active,
      sort_order: item.sort_order,
    });
    this.dialogVisible.set(true);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const raw = this.form.getRawValue();
    // Convert pesos → centavos before saving
    const values = { ...raw, price_cents: Math.round(raw.price_cents * 100) };
    const editing = this.editingItem();

    if (editing) {
      const result = await this.restaurantItemService.updateItem(editing.id, values);
      if (result) {
        this.messageService.add({ severity: 'success', summary: 'Platillo actualizado' });
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error al actualizar' });
      }
    } else {
      const result = await this.restaurantItemService.createItem(values);
      if (result) {
        this.messageService.add({ severity: 'success', summary: 'Platillo creado' });
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error al crear' });
      }
    }

    this.saving.set(false);
    this.dialogVisible.set(false);
    await this.loadItems();
  }

  confirmDelete(item: RestaurantItem): void {
    this.confirmationService.confirm({
      message: `¿Eliminar el platillo "${item.name}"?`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        const ok = await this.restaurantItemService.deleteItem(item.id);
        if (ok) {
          this.messageService.add({ severity: 'success', summary: 'Platillo eliminado' });
          await this.loadItems();
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error al eliminar' });
        }
      },
    });
  }
}
