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
import { SelectModule } from 'primeng/select';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { PackageService } from '../../../../core/services/package.service';
import { PACKAGE_COLORS } from '../../../../core/interfaces/package';
import type { PartyPackage } from '../../../../core/interfaces/package';

@Component({
  selector: 'app-admin-packages',
  templateUrl: './admin-packages.html',
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
export class AdminPackages {
  private readonly packageService = inject(PackageService);
  private readonly fb = inject(FormBuilder);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  readonly packages = signal<PartyPackage[]>([]);
  readonly loading = signal(true);
  readonly dialogVisible = signal(false);
  readonly editingPackage = signal<PartyPackage | null>(null);
  readonly saving = signal(false);

  readonly inclusionInput = signal('');
  readonly colorOptions = PACKAGE_COLORS;

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    min_guests: [1, [Validators.required, Validators.min(1)]],
    max_guests: [10, [Validators.required, Validators.min(1)]],
    price_cents: [0, [Validators.required, Validators.min(0)]],
    inclusions: [[] as string[]],
    color: [null as string | null],
    is_active: [true],
    sort_order: [0],
  });

  constructor() {
    this.loadPackages();
  }

  async loadPackages(): Promise<void> {
    this.loading.set(true);
    const data = await this.packageService.getAllPackages();
    this.packages.set(data);
    this.loading.set(false);
  }

  openNew(): void {
    this.editingPackage.set(null);
    this.form.reset({
      name: '',
      description: '',
      min_guests: 1,
      max_guests: 10,
      price_cents: 0,
      inclusions: [],
      color: null,
      is_active: true,
      sort_order: 0,
    });
    this.inclusionInput.set('');
    this.dialogVisible.set(true);
  }

  openEdit(pkg: PartyPackage): void {
    this.editingPackage.set(pkg);
    this.form.patchValue({
      name: pkg.name,
      description: pkg.description ?? '',
      min_guests: pkg.min_guests,
      max_guests: pkg.max_guests,
      price_cents: pkg.price_cents / 100, // Convert centavos → pesos for display
      inclusions: [...pkg.inclusions],
      color: pkg.color,
      is_active: pkg.is_active,
      sort_order: pkg.sort_order,
    });
    this.inclusionInput.set('');
    this.dialogVisible.set(true);
  }

  addInclusion(): void {
    const value = this.inclusionInput().trim();
    if (!value) return;
    const current = this.form.controls.inclusions.value;
    if (!current.includes(value)) {
      this.form.controls.inclusions.setValue([...current, value]);
    }
    this.inclusionInput.set('');
  }

  removeInclusion(index: number): void {
    const current = [...this.form.controls.inclusions.value];
    current.splice(index, 1);
    this.form.controls.inclusions.setValue(current);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const raw = this.form.getRawValue();
    // Convert pesos → centavos before saving
    const values = {
      ...raw,
      price_cents: Math.round(raw.price_cents * 100),
      color: (raw.color || null) as PartyPackage['color'],
    };
    const editing = this.editingPackage();

    if (editing) {
      const result = await this.packageService.updatePackage(editing.id, values);
      if (result) {
        this.messageService.add({ severity: 'success', summary: 'Paquete actualizado' });
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error al actualizar paquete' });
      }
    } else {
      const result = await this.packageService.createPackage(values);
      if (result) {
        this.messageService.add({ severity: 'success', summary: 'Paquete creado' });
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error al crear paquete' });
      }
    }

    this.saving.set(false);
    this.dialogVisible.set(false);
    await this.loadPackages();
  }

  confirmDelete(pkg: PartyPackage): void {
    this.confirmationService.confirm({
      message: `¿Eliminar el paquete "${pkg.name}"?`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        const ok = await this.packageService.deletePackage(pkg.id);
        if (ok) {
          this.messageService.add({ severity: 'success', summary: 'Paquete eliminado' });
          await this.loadPackages();
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error al eliminar' });
        }
      },
    });
  }

  /** Display price in pesos from cents */
  priceToPesos(cents: number): number {
    return cents / 100;
  }
}
