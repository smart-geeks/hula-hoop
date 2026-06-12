import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { FloatLabelModule } from 'primeng/floatlabel';
import { DatePickerModule } from 'primeng/datepicker';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { VenueConfigService } from '../../../../core/services/venue-config.service';
import { VenueService } from '../../../../core/services/venue.service';
import { AuthService } from '../../../../core/services/auth.service';
import { CashierService } from '../../../../core/services/cashier.service';
import { CategoryService } from '../../../../core/services/category.service';
import { PrinterConfigService } from '../../../../core/services/printer-config.service';
import type { VenueConfig } from '../../../../core/interfaces/venue-config';
import type { CashierProfile } from '../../../../core/interfaces/pos';
import type { Category, CategoryTipo } from '../../../../core/interfaces/category';
import type { PrinterConfig } from '../../../../core/interfaces/printer-config';

@Component({
  selector: 'app-admin-config',
  templateUrl: './admin-config.html',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputNumberModule,
    FloatLabelModule,
    DatePickerModule,
    ToastModule,
  ],
  providers: [MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminConfig {
  private readonly configService   = inject(VenueConfigService);
  private readonly venueService    = inject(VenueService);
  private readonly authService     = inject(AuthService);
  private readonly cashierService  = inject(CashierService);
  private readonly categoryService     = inject(CategoryService);
  private readonly printerCfgService  = inject(PrinterConfigService);
  private readonly fb                  = inject(FormBuilder);
  private readonly messageService      = inject(MessageService);

  readonly config  = signal<VenueConfig | null>(null);
  readonly loading = signal(true);
  readonly saving  = signal(false);

  readonly activeTab = signal<'general' | 'cajeros' | 'categorias' | 'impresora'>('general');

  setTab(tab: 'general' | 'cajeros' | 'categorias' | 'impresora'): void {
    this.activeTab.set(tab);
  }

  // ── Cajeros ────────────────────────────────────────────────
  readonly cashiers        = signal<CashierProfile[]>([]);
  readonly cashierLoading  = signal(false);
  readonly cashierSaving   = signal(false);

  // Diálogo: nuevo cajero
  readonly showCreateDialog = signal(false);
  readonly newNombre        = signal('');
  readonly newPin           = signal('');
  readonly newPinConfirm    = signal('');
  readonly createError      = signal('');

  // Diálogo: cambiar PIN
  readonly pinDialogCashier = signal<CashierProfile | null>(null);
  readonly changePin        = signal('');
  readonly changePinConfirm = signal('');
  readonly pinChangeError   = signal('');

  // ── Categorías ─────────────────────────────────────────────
  readonly allCategories     = signal<Category[]>([]);
  readonly categoriesLoading = signal(false);
  readonly categorySaving    = signal(false);
  readonly categoryTipoTab   = signal<CategoryTipo>('producto');

  readonly categoriesByTipo = computed(() =>
    this.allCategories().filter((c) => c.tipo === this.categoryTipoTab()),
  );

  // Diálogo: crear/editar categoría
  readonly showCategoryDialog = signal(false);
  readonly editingCategory    = signal<Category | null>(null);
  readonly catNombre          = signal('');
  readonly catColor           = signal('#3b82f6');
  readonly catError           = signal('');

  // ── Impresora ──────────────────────────────────────────────
  readonly printerConfig      = signal<PrinterConfig>(this.printerCfgService.load());
  readonly bluetoothScanning  = signal(false);
  readonly bluetoothSupported = 'bluetooth' in navigator;

  readonly form = this.fb.nonNullable.group({
    max_capacity_per_slot: [50, [Validators.required, Validators.min(1)]],
    playdate_ticket_price_cents: [19000, [Validators.required, Validators.min(0)]],
    playdate_extra_adult_price_cents: [6000, [Validators.required, Validators.min(0)]],
    min_hours_before_private: [24, [Validators.required, Validators.min(1)]],
    private_booking_horizon_date: [null as Date | null],
  });

  constructor() {
    // Re-load when the active venue changes (covers the initial async load race)
    effect(() => {
      const venueId = this.venueService.currentVenueId();
      if (venueId) {
        this.loadConfig();
        this.loadCashiers();
      } else {
        // Venues not yet loaded — keep UI unblocked
        this.loading.set(false);
      }
    });
    this.loadCategories();
  }

  async loadConfig(): Promise<void> {
    this.loading.set(true);
    const data = await this.configService.getConfig();
    if (data) {
      this.config.set(data);
      this.form.patchValue({
        max_capacity_per_slot: data.max_capacity_per_slot,
        playdate_ticket_price_cents: data.playdate_ticket_price_cents / 100,
        playdate_extra_adult_price_cents: data.playdate_extra_adult_price_cents / 100,
        min_hours_before_private: data.min_hours_before_private,
        private_booking_horizon_date: data.private_booking_horizon_date
          ? new Date(data.private_booking_horizon_date + 'T00:00:00')
          : null,
      });
    }
    this.loading.set(false);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const cfg = this.config();
    const userId = this.authService.currentUser()?.id;
    if (!cfg || !userId) return;

    this.saving.set(true);
    const values = this.form.getRawValue();

    const horizonDate = values.private_booking_horizon_date;
    const horizonDateStr = horizonDate
      ? `${horizonDate.getFullYear()}-${String(horizonDate.getMonth() + 1).padStart(2, '0')}-${String(horizonDate.getDate()).padStart(2, '0')}`
      : null;

    const result = await this.configService.updateConfig(cfg.id, {
      max_capacity_per_slot: values.max_capacity_per_slot,
      playdate_ticket_price_cents: Math.round(values.playdate_ticket_price_cents * 100), // pesos → centavos
      playdate_extra_adult_price_cents: Math.round(values.playdate_extra_adult_price_cents * 100), // pesos → centavos
      min_hours_before_private: values.min_hours_before_private,
      private_booking_horizon_date: horizonDateStr,
      updated_by: userId,
    });

    if (result) {
      this.config.set(result);
      this.messageService.add({ severity: 'success', summary: 'Configuración guardada' });
    } else {
      this.messageService.add({ severity: 'error', summary: 'Error al guardar configuración' });
    }

    this.saving.set(false);
  }

  // ── Cajeros ────────────────────────────────────────────────

  async loadCashiers(): Promise<void> {
    this.cashierLoading.set(true);
    const data = await this.cashierService.getAll();
    this.cashiers.set(data);
    this.cashierLoading.set(false);
  }

  openCreateDialog(): void {
    this.newNombre.set('');
    this.newPin.set('');
    this.newPinConfirm.set('');
    this.createError.set('');
    this.showCreateDialog.set(true);
  }

  closeCreateDialog(): void {
    this.showCreateDialog.set(false);
  }

  async createCashier(): Promise<void> {
    const nombre = this.newNombre().trim();
    const pin    = this.newPin().trim();

    if (!nombre) { this.createError.set('El nombre es requerido'); return; }
    if (!/^\d{4}$/.test(pin)) { this.createError.set('El PIN debe ser exactamente 4 dígitos numéricos'); return; }
    if (pin !== this.newPinConfirm().trim()) { this.createError.set('Los PINs no coinciden'); return; }

    this.cashierSaving.set(true);
    const created = await this.cashierService.create(nombre, pin);
    this.cashierSaving.set(false);

    if (created) {
      this.cashiers.update((list) => [...list, created].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.closeCreateDialog();
      this.messageService.add({ severity: 'success', summary: `Cajero "${nombre}" creado` });
    } else {
      this.createError.set('No se pudo crear el cajero. Inténtalo de nuevo.');
    }
  }

  async toggleCashierActivo(cashier: CashierProfile): Promise<void> {
    const ok = await this.cashierService.setActivo(cashier.id, !cashier.activo);
    if (ok) {
      this.cashiers.update((list) =>
        list.map((c) => c.id === cashier.id ? { ...c, activo: !c.activo } : c),
      );
      const estado = !cashier.activo ? 'activado' : 'desactivado';
      this.messageService.add({ severity: 'info', summary: `Cajero ${estado}` });
    }
  }

  openPinDialog(cashier: CashierProfile): void {
    this.pinDialogCashier.set(cashier);
    this.changePin.set('');
    this.changePinConfirm.set('');
    this.pinChangeError.set('');
  }

  closePinDialog(): void {
    this.pinDialogCashier.set(null);
  }

  async savePinChange(): Promise<void> {
    const pin = this.changePin().trim();
    if (!/^\d{4}$/.test(pin)) { this.pinChangeError.set('El PIN debe ser exactamente 4 dígitos numéricos'); return; }
    if (pin !== this.changePinConfirm().trim()) { this.pinChangeError.set('Los PINs no coinciden'); return; }

    const cashier = this.pinDialogCashier();
    if (!cashier) return;

    this.cashierSaving.set(true);
    const ok = await this.cashierService.updatePin(cashier.id, pin);
    this.cashierSaving.set(false);

    if (ok) {
      this.closePinDialog();
      this.messageService.add({ severity: 'success', summary: 'PIN actualizado correctamente' });
    } else {
      this.pinChangeError.set('No se pudo actualizar el PIN. Inténtalo de nuevo.');
    }
  }

  // ── Categorías ─────────────────────────────────────────────

  async loadCategories(): Promise<void> {
    this.categoriesLoading.set(true);
    const data = await this.categoryService.getAll();
    this.allCategories.set(data);
    this.categoriesLoading.set(false);
  }

  openCategoryDialog(cat?: Category): void {
    this.editingCategory.set(cat ?? null);
    this.catNombre.set(cat?.nombre ?? '');
    this.catColor.set(cat?.color ?? '#3b82f6');
    this.catError.set('');
    this.showCategoryDialog.set(true);
  }

  closeCategoryDialog(): void {
    this.showCategoryDialog.set(false);
  }

  async saveCategory(): Promise<void> {
    const nombre = this.catNombre().trim();
    if (!nombre) { this.catError.set('El nombre es requerido'); return; }

    this.categorySaving.set(true);
    const editing = this.editingCategory();

    if (editing) {
      const updated = await this.categoryService.update(editing.id, {
        nombre,
        color: this.catColor(),
      });
      if (updated) {
        this.allCategories.update((list) => list.map((c) => c.id === updated.id ? updated : c));
        this.closeCategoryDialog();
        this.messageService.add({ severity: 'success', summary: 'Categoría actualizada' });
      } else {
        this.catError.set('No se pudo actualizar. Verifica que el nombre no esté repetido.');
      }
    } else {
      const created = await this.categoryService.create({
        tipo:   this.categoryTipoTab(),
        nombre,
        color:  this.catColor(),
        icono:  null,
        orden:  this.categoriesByTipo().length + 1,
        activo: true,
      });
      if (created) {
        this.allCategories.update((list) => [...list, created]);
        this.closeCategoryDialog();
        this.messageService.add({ severity: 'success', summary: `Categoría "${nombre}" creada` });
      } else {
        this.catError.set('No se pudo crear. Verifica que el nombre no esté repetido.');
      }
    }
    this.categorySaving.set(false);
  }

  async toggleCategory(cat: Category): Promise<void> {
    const ok = await this.categoryService.setActivo(cat.id, !cat.activo);
    if (ok) {
      this.allCategories.update((list) =>
        list.map((c) => c.id === cat.id ? { ...c, activo: !c.activo } : c),
      );
    }
  }

  // ── Impresora ──────────────────────────────────────────────

  updatePrinter<K extends keyof PrinterConfig>(key: K, value: PrinterConfig[K]): void {
    this.printerConfig.update((cfg) => ({ ...cfg, [key]: value }));
  }

  async scanBluetoothDevice(): Promise<void> {
    if (!this.bluetoothSupported) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Bluetooth no disponible',
        detail: 'Usa Chrome en Android para usar la API de Bluetooth',
      });
      return;
    }

    this.bluetoothScanning.set(true);
    try {
      // Acepta cualquier dispositivo; registra servicios ESC/POS comunes como opcionales
      // para poder acceder a ellos al imprimir sin volver a pedir permisos
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // impresoras BT genéricas
          '0000ff00-0000-1000-8000-00805f9b34fb', // perfil serial BT
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // algunos modelos Xprinter
        ],
      });

      this.printerConfig.update((cfg) => ({
        ...cfg,
        bluetoothDevice:   device.name ?? '(sin nombre)',
        bluetoothDeviceId: device.id,
      }));

      this.messageService.add({
        severity: 'success',
        summary: `Impresora seleccionada: ${device.name ?? device.id}`,
      });
    } catch (err: unknown) {
      // NotFoundError = usuario canceló el diálogo — no es un error real
      if ((err as DOMException)?.name !== 'NotFoundError') {
        console.error('Web Bluetooth error:', err);
        this.messageService.add({ severity: 'error', summary: 'No se pudo conectar con el dispositivo' });
      }
    } finally {
      this.bluetoothScanning.set(false);
    }
  }

  copyBluetoothFlag(): void {
    navigator.clipboard.writeText('chrome://flags/#enable-experimental-web-platform-features').then(() => {
      this.messageService.add({ severity: 'info', summary: 'URL copiada al portapapeles' });
    });
  }

  savePrinterConfig(): void {
    this.printerCfgService.save(this.printerConfig());
    this.messageService.add({ severity: 'success', summary: 'Configuración de impresora guardada' });
  }
}
