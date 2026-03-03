import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { FloatLabelModule } from 'primeng/floatlabel';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

@Component({
  selector: 'app-admin-time-slots',
  templateUrl: './admin-time-slots.html',
  imports: [
    ReactiveFormsModule,
    TableModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
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
export class AdminTimeSlots {
  private readonly slotService = inject(TimeSlotService);
  private readonly fb = inject(FormBuilder);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  readonly slots = signal<TimeSlot[]>([]);
  readonly loading = signal(true);
  readonly dialogVisible = signal(false);
  readonly editingSlot = signal<TimeSlot | null>(null);
  readonly saving = signal(false);

  readonly weekdaySlots = computed(() => this.slots().filter((s) => s.day_type === 'weekday'));
  readonly weekendSlots = computed(() => this.slots().filter((s) => s.day_type === 'weekend'));

  readonly dayTypeOptions = [
    { label: 'Entre semana', value: 'weekday' },
    { label: 'Fin de semana', value: 'weekend' },
  ];

  readonly form = this.fb.nonNullable.group({
    day_type: ['weekday' as 'weekday' | 'weekend', Validators.required],
    start_time: ['', Validators.required],
    end_time: ['', Validators.required],
    is_active: [true],
  });

  constructor() {
    this.loadSlots();
  }

  async loadSlots(): Promise<void> {
    this.loading.set(true);
    const data = await this.slotService.getAllSlots();
    this.slots.set(data);
    this.loading.set(false);
  }

  openNew(): void {
    this.editingSlot.set(null);
    this.form.reset({ day_type: 'weekday', start_time: '', end_time: '', is_active: true });
    this.dialogVisible.set(true);
  }

  openEdit(slot: TimeSlot): void {
    this.editingSlot.set(slot);
    this.form.patchValue({
      day_type: slot.day_type,
      start_time: slot.start_time.substring(0, 5), // HH:MM
      end_time: slot.end_time.substring(0, 5),
      is_active: slot.is_active,
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
    const editing = this.editingSlot();

    if (editing) {
      const result = await this.slotService.updateSlot(editing.id, values);
      if (result) {
        this.messageService.add({ severity: 'success', summary: 'Horario actualizado' });
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error al actualizar horario' });
      }
    } else {
      const result = await this.slotService.createSlot(values);
      if (result) {
        this.messageService.add({ severity: 'success', summary: 'Horario creado' });
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error al crear horario' });
      }
    }

    this.saving.set(false);
    this.dialogVisible.set(false);
    await this.loadSlots();
  }

  confirmDelete(slot: TimeSlot): void {
    this.confirmationService.confirm({
      message: `¿Eliminar el horario ${this.formatTime(slot.start_time)} - ${this.formatTime(slot.end_time)}?`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        const ok = await this.slotService.deleteSlot(slot.id);
        if (ok) {
          this.messageService.add({ severity: 'success', summary: 'Horario eliminado' });
          await this.loadSlots();
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error al eliminar. Puede que tenga reservas asociadas.' });
        }
      },
    });
  }

  async toggleActive(slot: TimeSlot): Promise<void> {
    const result = await this.slotService.updateSlot(slot.id, { is_active: !slot.is_active });
    if (result) {
      this.messageService.add({
        severity: 'success',
        summary: result.is_active ? 'Horario activado' : 'Horario desactivado',
      });
      await this.loadSlots();
    }
  }

  formatTime(time: string): string {
    return time.substring(0, 5);
  }

  dayTypeLabel(type: string): string {
    return type === 'weekday' ? 'Entre semana' : 'Fin de semana';
  }
}
