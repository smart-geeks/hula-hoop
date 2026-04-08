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
import { SnackOptionService } from '../../../../core/services/snack-option.service';
import type { SnackOption } from '../../../../core/interfaces/snack-option';

@Component({
  selector: 'app-admin-snacks',
  templateUrl: './admin-snacks.html',
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
  ],
  providers: [ConfirmationService, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSnacks {
  private readonly snackService = inject(SnackOptionService);
  private readonly fb = inject(FormBuilder);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  readonly snacks = signal<SnackOption[]>([]);
  readonly loading = signal(true);
  readonly dialogVisible = signal(false);
  readonly editingSnack = signal<SnackOption | null>(null);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    is_active: [true],
    sort_order: [0],
  });

  constructor() {
    this.loadSnacks();
  }

  async loadSnacks(): Promise<void> {
    this.loading.set(true);
    const data = await this.snackService.getAllSnackOptions();
    this.snacks.set(data);
    this.loading.set(false);
  }

  openNew(): void {
    this.editingSnack.set(null);
    this.form.reset({ name: '', description: '', is_active: true, sort_order: 0 });
    this.dialogVisible.set(true);
  }

  openEdit(snack: SnackOption): void {
    this.editingSnack.set(snack);
    this.form.patchValue({
      name: snack.name,
      description: snack.description ?? '',
      is_active: snack.is_active,
      sort_order: snack.sort_order,
    });
    this.dialogVisible.set(true);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const values = this.form.getRawValue();
    const editing = this.editingSnack();

    if (editing) {
      const result = await this.snackService.updateSnackOption(editing.id, values);
      if (result) {
        this.messageService.add({ severity: 'success', summary: 'Merienda actualizada' });
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error al actualizar merienda' });
      }
    } else {
      const result = await this.snackService.createSnackOption(values);
      if (result) {
        this.messageService.add({ severity: 'success', summary: 'Merienda creada' });
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error al crear merienda' });
      }
    }

    this.saving.set(false);
    this.dialogVisible.set(false);
    await this.loadSnacks();
  }

  confirmDelete(snack: SnackOption): void {
    this.confirmationService.confirm({
      message: `¿Eliminar la merienda "${snack.name}"?`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        const ok = await this.snackService.deleteSnackOption(snack.id);
        if (ok) {
          this.messageService.add({ severity: 'success', summary: 'Merienda eliminada' });
          await this.loadSnacks();
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error al eliminar' });
        }
      },
    });
  }
}
