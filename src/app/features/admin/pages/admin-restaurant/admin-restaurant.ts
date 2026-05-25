import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
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
import { SelectModule } from 'primeng/select';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { RestaurantItemService } from '../../../../core/services/restaurant-item.service';
import { VenueService } from '../../../../core/services/venue.service';
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
    SelectModule,
    CurrencyMxnPipe,
  ],
  providers: [ConfirmationService, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminRestaurant {
  private readonly restaurantItemService = inject(RestaurantItemService);
  private readonly venueService          = inject(VenueService);
  private readonly fb                    = inject(FormBuilder);
  private readonly confirmationService   = inject(ConfirmationService);
  private readonly messageService        = inject(MessageService);

  readonly venues        = this.venueService.venues;
  readonly items         = signal<RestaurantItem[]>([]);
  readonly loading       = signal(true);
  readonly dialogVisible = signal(false);
  readonly editingItem   = signal<RestaurantItem | null>(null);
  readonly saving        = signal(false);

  readonly form = this.fb.nonNullable.group({
    venue_id:    ['', Validators.required],
    category:    ['', Validators.required],
    name:        ['', Validators.required],
    description: [''],
    price_cents: [0, [Validators.required, Validators.min(0)]],
    is_active:   [true],
    sort_order:  [0],
  });

  constructor() {
    // Reload list reactively whenever the active venue changes
    effect(() => {
      const venueId = this.venueService.currentVenueId();
      if (venueId) {
        this.loadItems(venueId);
      } else {
        this.items.set([]);
        this.loading.set(false);
      }
    });
  }

  async loadItems(venueId: string): Promise<void> {
    this.loading.set(true);
    const data = await this.restaurantItemService.getAllItemsByVenue(venueId);
    this.items.set(data);
    this.loading.set(false);
  }

  openNew(): void {
    this.editingItem.set(null);
    this.form.reset({
      venue_id:    this.venueService.currentVenueId() ?? '',
      category:    '',
      name:        '',
      description: '',
      price_cents: 0,
      is_active:   true,
      sort_order:  0,
    });
    this.dialogVisible.set(true);
  }

  openEdit(item: RestaurantItem): void {
    this.editingItem.set(item);
    this.form.patchValue({
      venue_id:    item.venue_id,
      category:    item.category,
      name:        item.name,
      description: item.description ?? '',
      price_cents: item.price_cents / 100,
      is_active:   item.is_active,
      sort_order:  item.sort_order,
    });
    this.dialogVisible.set(true);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const raw    = this.form.getRawValue();
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
    const venueId = this.venueService.currentVenueId();
    if (venueId) await this.loadItems(venueId);
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
          const venueId = this.venueService.currentVenueId();
          if (venueId) await this.loadItems(venueId);
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error al eliminar' });
        }
      },
    });
  }
}
