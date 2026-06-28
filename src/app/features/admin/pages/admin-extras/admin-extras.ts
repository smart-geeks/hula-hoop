import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
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
import type { Extra, ExtraCategory } from '../../../../core/interfaces/extra';

@Component({
  selector: 'app-admin-extras',
  templateUrl: './admin-extras.html',
  imports: [
    FormsModule,
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
  readonly hasVariants = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    price_cents: [0, [Validators.required, Validators.min(0)]],
    pay_at_venue: [false],
    is_active: [true],
    sort_order: [0],
    category: ['extras' as ExtraCategory, Validators.required],
    variants: this.fb.array([]),
  });

  constructor() {
    this.loadExtras();
  }

  get variantsFormArray(): FormArray {
    return this.form.controls.variants as FormArray;
  }

  async loadExtras(): Promise<void> {
    this.loading.set(true);
    const data = await this.extraService.getAllExtras();
    this.extras.set(data);
    this.loading.set(false);
  }

  onToggleVariants(val: boolean): void {
    this.hasVariants.set(val);
    if (val && this.variantsFormArray.length === 0) {
      this.addVariant();
    }
  }

  addVariant(): void {
    this.variantsFormArray.push(
      this.fb.group({
        id: [''],
        name: ['', Validators.required],
        price_cents: [0, [Validators.required, Validators.min(0)]],
      })
    );
  }

  removeVariant(index: number): void {
    this.variantsFormArray.removeAt(index);
  }

  openNew(): void {
    this.editingExtra.set(null);
    this.hasVariants.set(false);
    this.form.reset({ name: '', description: '', price_cents: 0, pay_at_venue: false, is_active: true, sort_order: 0, category: 'extras' });
    this.variantsFormArray.clear();
    this.dialogVisible.set(true);
  }

  openEdit(extra: Extra): void {
    this.editingExtra.set(extra);
    this.variantsFormArray.clear();
    const hasVars = !!(extra.variants && extra.variants.length > 0);
    this.hasVariants.set(hasVars);

    if (hasVars && extra.variants) {
      for (const v of extra.variants) {
        this.variantsFormArray.push(
          this.fb.group({
            id: [v.id],
            name: [v.name, Validators.required],
            price_cents: [v.price_cents / 100, [Validators.required, Validators.min(0)]], // Convert cents → pesos for display
          })
        );
      }
    }

    this.form.patchValue({
      name: extra.name,
      description: extra.description ?? '',
      price_cents: hasVars ? 0 : extra.price_cents / 100, // Convert centavos → pesos for display
      pay_at_venue: extra.pay_at_venue,
      is_active: extra.is_active,
      sort_order: extra.sort_order,
      category: extra.category ?? 'extras',
    });
    this.dialogVisible.set(true);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.hasVariants() && this.variantsFormArray.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Variantes requeridas',
        detail: 'Debes agregar al menos una variante si la opción está activa.',
      });
      return;
    }

    this.saving.set(true);
    const raw = this.form.getRawValue();

    let priceCents = Math.round(raw.price_cents * 100);
    let variantsList: any[] | null = null;

    if (this.hasVariants()) {
      variantsList = raw.variants.map((v: any) => ({
        id: v.id || 'var_' + Math.random().toString(36).substring(2, 9),
        name: v.name,
        price_cents: Math.round(v.price_cents * 100),
      }));
      // Set the default price to the first variant's price
      priceCents = variantsList.length > 0 ? variantsList[0].price_cents : 0;
    }

    const values = {
      name: raw.name,
      description: raw.description || null,
      price_cents: priceCents,
      pay_at_venue: raw.pay_at_venue,
      is_active: raw.is_active,
      sort_order: raw.sort_order,
      category: raw.category as ExtraCategory,
      variants: variantsList,
    };

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
