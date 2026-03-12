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
import { ExtraService } from '../../../../core/services/extra.service';
import type { Extra } from '../../../../core/interfaces/extra';

@Component({
  selector: 'app-admin-extras',
  templateUrl: './admin-extras.html',
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
export class AdminExtras {
  private readonly extraService = inject(ExtraService);
  private readonly fb = inject(FormBuilder);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  readonly extras = signal<Extra[]>([]);
  readonly loading = signal(true);
  readonly dialogVisible = signal(false);
  readonly editingExtra = signal<Extra | null>(null);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    price_cents: [0, [Validators.required, Validators.min(0)]],
    is_active: [true],
    sort_order: [0],
  });

  constructor() {
    this.loadExtras();
  }

  async loadExtras(): Promise<void> {
    this.loading.set(true);
    const data = await this.extraService.getAllExtras();
    this.extras.set(data);
    this.loading.set(false);
  }

  openNew(): void {
    this.editingExtra.set(null);
    this.form.reset({ name: '', description: '', price_cents: 0, is_active: true, sort_order: 0 });
    this.dialogVisible.set(true);
  }

  openEdit(extra: Extra): void {
    this.editingExtra.set(extra);
    this.form.patchValue({
      name: extra.name,
      description: extra.description ?? '',
      price_cents: extra.price_cents / 100, // Convert centavos → pesos for display
      is_active: extra.is_active,
      sort_order: extra.sort_order,
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
    const editing = this.editingExtra();

    if (editing) {
      const result = await this.extraService.updateExtra(editing.id, values);
      if (result) {
        this.messageService.add({ severity: 'success', summary: 'Extra actualizado' });
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error al actualizar extra' });
      }
    } else {
      const result = await this.extraService.createExtra(values);
      if (result) {
        this.messageService.add({ severity: 'success', summary: 'Extra creado' });
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error al crear extra' });
      }
    }

    this.saving.set(false);
    this.dialogVisible.set(false);
    await this.loadExtras();
  }

  confirmDelete(extra: Extra): void {
    this.confirmationService.confirm({
      message: `¿Eliminar el extra "${extra.name}"?`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        const ok = await this.extraService.deleteExtra(extra.id);
        if (ok) {
          this.messageService.add({ severity: 'success', summary: 'Extra eliminado' });
          await this.loadExtras();
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error al eliminar' });
        }
      },
    });
  }
}
