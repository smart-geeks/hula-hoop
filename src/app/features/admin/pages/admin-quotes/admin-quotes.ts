import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  NgZone,
  OnInit,
  signal,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuoteService } from '../../../../core/services/quote.service';
import { ClientService } from '../../../../core/services/client.service';
import { ContractService } from '../../../../core/services/contract.service';
import { PackageService } from '../../../../core/services/package.service';
import { ExtraService } from '../../../../core/services/extra.service';
import { SnackOptionService } from '../../../../core/services/snack-option.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import { ReservationService } from '../../../../core/services/reservation.service';
import type { Quote, QuoteStatus } from '../../../../core/interfaces/quote';
import type { Client } from '../../../../core/interfaces/client';
import type { PartyPackage } from '../../../../core/interfaces/package';
import type { Extra } from '../../../../core/interfaces/extra';
import type { SnackOption } from '../../../../core/interfaces/snack-option';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
type PayMethod = 'efectivo' | 'tarjeta' | 'transferencia';

export interface SlotAvailability {
  slot: TimeSlot;
  blocked: boolean;
}

const STATUS_CONFIG: Record<QuoteStatus, { label: string; classes: string }> = {
  borrador:  { label: 'Borrador',  classes: 'bg-slate-100 text-slate-600' },
  enviada:   { label: 'Enviada',   classes: 'bg-blue-100 text-blue-700' },
  aprobada:  { label: 'Aprobada',  classes: 'bg-emerald-100 text-emerald-700' },
  rechazada: { label: 'Rechazada', classes: 'bg-red-100 text-red-700' },
  vencida:   { label: 'Vencida',   classes: 'bg-amber-100 text-amber-700' },
};

const PACKAGE_COLOR_HEX: Record<string, string> = {
  'lima':              '#8CE9AF',
  'rosa-pastel':       '#EDB2E4',
  'azul-cielo':        '#85E8E3',
  'morado':            '#686ABB',
  'rojo-brillante':    '#E30D1C',
  'naranja':           '#FC7632',
  'marron':            '#B28B7E',
  'amarillo-merengue': '#F6F090',
};

@Component({
  selector: 'app-admin-quotes',
  templateUrl: './admin-quotes.html',
  imports: [CurrencyPipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminQuotes implements OnInit {
  private readonly cdr                = inject(ChangeDetectorRef);
  private readonly ngZone             = inject(NgZone);
  private readonly quoteService       = inject(QuoteService);
  private readonly clientService      = inject(ClientService);
  private readonly contractService    = inject(ContractService);
  private readonly packageService     = inject(PackageService);
  private readonly extraService       = inject(ExtraService);
  private readonly snackOptionService = inject(SnackOptionService);
  private readonly timeSlotService    = inject(TimeSlotService);
  private readonly reservationService = inject(ReservationService);

  // ── Catalog data ─────────────────────────────────────────
  readonly packages     = signal<PartyPackage[]>([]);
  readonly extras       = signal<Extra[]>([]);
  readonly snackOptions = signal<SnackOption[]>([]);
  readonly allSlots     = signal<TimeSlot[]>([]);
  readonly allClients   = signal<Client[]>([]);
  readonly quotes       = signal<Quote[]>([]);

  // ── Page state ───────────────────────────────────────────
  readonly loading      = signal(true);
  readonly statusFilter = signal<QuoteStatus | 'all'>('all');
  readonly toast        = signal<{ type: 'success' | 'error'; message: string } | null>(null);
  readonly deleteTarget = signal<Quote | null>(null);

  // ── Wizard / drawer state ─────────────────────────────────
  readonly drawerOpen    = signal(false);
  readonly wizardStep    = signal<WizardStep>(1);
  readonly saving        = signal(false);
  readonly editingQuote  = signal<Quote | null>(null);

  // Step 1 — Cliente
  readonly clientQuery        = signal('');
  readonly clientDropdownOpen = signal(false);
  readonly selectedClient     = signal<Client | null>(null);
  readonly guestCount         = signal<number>(10);

  // Step 1 — Inline client creation
  readonly showCreateClient = signal(false);
  readonly newClientName    = signal('');
  readonly newClientPhone   = signal('');
  readonly newClientEmail   = signal('');
  readonly savingNewClient  = signal(false);

  // Step 2 — Fecha & Horario
  readonly selectedDate  = signal<string>('');
  readonly daySlots      = signal<SlotAvailability[]>([]);
  readonly selectedSlot  = signal<TimeSlot | null>(null);
  readonly loadingSlots  = signal(false);

  // Step 3 — Paquete
  readonly selectedPackage = signal<PartyPackage | null>(null);

  // Step 4 — Merienda
  readonly selectedSnack = signal<SnackOption | null>(null);
  readonly skipSnack     = signal(false);

  // Step 5 — Extras
  readonly extraQty = signal<Map<string, number>>(new Map());

  // Step 6 — Resumen
  readonly discount = signal<number>(0);
  readonly notes    = signal<string>('');

  // ── Send popover ─────────────────────────────────────────
  readonly sendTarget  = signal<Quote | null>(null);
  readonly sendMessage = signal('');

  // ── Anticipo dialog (quote → contract) ───────────────────
  readonly anticoDialog  = signal<Quote | null>(null);
  readonly anticoMonto   = signal(0);
  readonly anticoFecha   = signal('');
  readonly anticoMetodo  = signal<PayMethod>('efectivo');
  readonly anticoSaving  = signal(false);

  // ── Computed ─────────────────────────────────────────────
  readonly STATUS_CONFIG = STATUS_CONFIG;

  readonly filteredQuotes = computed(() => {
    const f = this.statusFilter();
    return f === 'all' ? this.quotes() : this.quotes().filter((q) => q.estado === f);
  });

  readonly clientResults = computed(() => {
    const q = this.clientQuery().toLowerCase().trim();
    if (!q) return this.allClients().slice(0, 6);
    return this.allClients()
      .filter(
        (c) =>
          c.nombre.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.telefono?.includes(q),
      )
      .slice(0, 8);
  });

  readonly statusOptions: Array<{ value: QuoteStatus | 'all'; label: string }> = [
    { value: 'all',       label: 'Todos' },
    { value: 'borrador',  label: 'Borrador' },
    { value: 'enviada',   label: 'Enviada' },
    { value: 'aprobada',  label: 'Aprobada' },
    { value: 'rechazada', label: 'Rechazada' },
    { value: 'vencida',   label: 'Vencida' },
  ];

  readonly selectedExtras = computed(() => {
    const qty = this.extraQty();
    return this.extras().filter((e) => (qty.get(e.id) ?? 0) > 0);
  });

  readonly summaryItems = computed(() => {
    const items: Array<{ descripcion: string; cantidad: number; precio_unitario: number }> = [];
    const pkg = this.selectedPackage();
    if (pkg) {
      items.push({ descripcion: pkg.name, cantidad: 1, precio_unitario: pkg.price_cents / 100 });
    }
    const snack = this.selectedSnack();
    if (snack && !this.skipSnack()) {
      items.push({ descripcion: `Merienda: ${snack.name}`, cantidad: 1, precio_unitario: 0 });
    }
    const qty = this.extraQty();
    for (const extra of this.extras()) {
      const q = qty.get(extra.id) ?? 0;
      if (q > 0) {
        items.push({ descripcion: extra.name, cantidad: q, precio_unitario: extra.price_cents / 100 });
      }
    }
    return items;
  });

  readonly subtotalAmount = computed(() =>
    this.summaryItems().reduce((s, it) => s + it.cantidad * it.precio_unitario, 0),
  );

  readonly totalAmount = computed(() => Math.max(0, this.subtotalAmount() - this.discount()));

  readonly depositAmount = computed(() => {
    const pkg = this.selectedPackage();
    if (!pkg) return 0;
    const total = this.totalAmount();
    switch (pkg.deposit_type) {
      case 'full':       return total;
      case 'percentage': return Math.round(total * pkg.deposit_value) / 100;
      case 'fixed':      return pkg.deposit_value / 100;
      default:           return 0;
    }
  });

  readonly balanceDue = computed(() => Math.max(0, this.totalAmount() - this.depositAmount()));

  readonly packageColor = computed(() => {
    const pkg = this.selectedPackage();
    return pkg?.color ? PACKAGE_COLOR_HEX[pkg.color] ?? '#E30D1C' : '#E30D1C';
  });

  readonly todayStr = computed(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  readonly step1Valid = computed(() => this.selectedClient() !== null);
  readonly step2Valid = computed(() => !!this.selectedDate() && this.selectedSlot() !== null);
  readonly step3Valid = computed(() => this.selectedPackage() !== null);
  readonly step4Valid = computed(() => true);

  // ── Lifecycle ─────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    const [quotes, clients, packages, extras, snacks, slots] = await Promise.all([
      this.quoteService.getAll(),
      this.clientService.getAll(),
      this.packageService.getActivePackages(),
      this.extraService.getActiveExtras(),
      this.snackOptionService.getActiveSnackOptions(),
      this.timeSlotService.getActiveSlots(),
    ]);
    this.ngZone.run(() => {
      this.quotes.set(quotes);
      this.allClients.set(clients);
      this.packages.set(packages);
      this.extras.set(extras);
      this.snackOptions.set(snacks);
      this.allSlots.set(slots);
      this.loading.set(false);
    });
  }

  // ── Wizard navigation ─────────────────────────────────────
  openCreate(): void {
    this.resetWizard();
    this.editingQuote.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(quote: Quote): void {
    this.resetWizard();
    this.editingQuote.set(quote);

    const client = this.allClients().find((c) => c.id === quote.client_id) ?? null;
    this.selectedClient.set(client);
    this.guestCount.set(quote.guest_count ?? 10);
    this.selectedDate.set(quote.fecha_evento ?? '');
    if (quote.fecha_evento) {
      void this.loadSlotsForDate(quote.fecha_evento, quote.hora_inicio ?? undefined);
    }
    this.discount.set(quote.descuento ?? 0);
    this.notes.set(quote.notas ?? '');
    this.wizardStep.set(6);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.resetWizard();
  }

  goToStep(step: WizardStep): void {
    this.wizardStep.set(step);
  }

  nextStep(): void {
    const current = this.wizardStep();
    if (current < 6) {
      if (current === 3 && this.snackOptions().length === 0) {
        this.wizardStep.set(5 as WizardStep);
        return;
      }
      this.wizardStep.set((current + 1) as WizardStep);
    }
  }

  prevStep(): void {
    const current = this.wizardStep();
    if (current > 1) {
      if (current === 5 && this.snackOptions().length === 0) {
        this.wizardStep.set(3 as WizardStep);
        return;
      }
      this.wizardStep.set((current - 1) as WizardStep);
    }
  }

  canGoNext(): boolean {
    switch (this.wizardStep()) {
      case 1: return this.step1Valid();
      case 2: return this.step2Valid();
      case 3: return this.step3Valid();
      case 4: return this.step4Valid();
      case 5: return true;
      default: return false;
    }
  }

  // ── Step 1: Client search ─────────────────────────────────
  onClientInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.clientQuery.set(val);
    this.clientDropdownOpen.set(true);
    this.showCreateClient.set(false);
    if (!val) this.selectedClient.set(null);
  }

  selectClient(client: Client): void {
    this.selectedClient.set(client);
    this.clientQuery.set('');
    this.clientDropdownOpen.set(false);
    this.showCreateClient.set(false);
  }

  clearClient(): void {
    this.selectedClient.set(null);
    this.clientQuery.set('');
    this.showCreateClient.set(false);
  }

  onGuestCountInput(event: Event): void {
    const val = +(event.target as HTMLInputElement).value;
    this.guestCount.set(isNaN(val) ? 1 : Math.max(1, val));
  }

  // ── Step 1: Inline client creation ───────────────────────
  openCreateClient(): void {
    this.showCreateClient.set(true);
    this.newClientName.set(this.clientQuery().trim());
    this.newClientPhone.set('');
    this.newClientEmail.set('');
    this.clientDropdownOpen.set(false);
  }

  cancelCreateClient(): void {
    this.showCreateClient.set(false);
    this.newClientName.set('');
    this.newClientPhone.set('');
    this.newClientEmail.set('');
  }

  async submitCreateClient(): Promise<void> {
    const name = this.newClientName().trim();
    if (!name || this.savingNewClient()) return;
    this.savingNewClient.set(true);
    const created = await this.clientService.create({
      nombre:   name,
      telefono: this.newClientPhone().trim() || undefined,
      email:    this.newClientEmail().trim() || undefined,
    });
    if (created) {
      this.allClients.update((list) =>
        [...list, created].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      );
      this.selectClient(created);
      this.cancelCreateClient();
      this.showToast('success', `Cliente "${created.nombre}" creado`);
    } else {
      this.showToast('error', 'No se pudo crear el cliente');
    }
    this.savingNewClient.set(false);
    this.cdr.detectChanges();
  }

  // ── Step 2: Date & Slot ───────────────────────────────────
  async onDateChange(event: Event): Promise<void> {
    const val = (event.target as HTMLInputElement).value;
    this.selectedDate.set(val);
    this.selectedSlot.set(null);
    if (val) await this.loadSlotsForDate(val);
  }

  private async loadSlotsForDate(date: string, preselectedStart?: string): Promise<void> {
    this.loadingSlots.set(true);
    const d = new Date(date + 'T12:00:00');
    const day = d.getDay();
    const isWeekend = day === 0 || day === 6;
    const dayType = isWeekend ? 'weekend' : 'weekday';

    const slotsForDay = this.allSlots().filter((s) => s.day_type === dayType);

    const results: SlotAvailability[] = await Promise.all(
      slotsForDay.map(async (slot) => {
        const blocked = await this.reservationService.isSlotBlockedByPrivate(date, slot.id);
        return { slot, blocked };
      }),
    );

    this.daySlots.set(results);
    if (preselectedStart) {
      const match = results.find((r) => r.slot.start_time === preselectedStart);
      if (match && !match.blocked) this.selectedSlot.set(match.slot);
    }
    this.loadingSlots.set(false);
    this.cdr.detectChanges();
  }

  selectSlot(availability: SlotAvailability): void {
    if (availability.blocked) return;
    this.selectedSlot.set(availability.slot);
  }

  // ── Step 3: Package ───────────────────────────────────────
  selectPackage(pkg: PartyPackage): void {
    this.selectedPackage.set(pkg);
  }

  getPackageColor(pkg: PartyPackage): string {
    return pkg.color ? PACKAGE_COLOR_HEX[pkg.color] ?? '#E30D1C' : '#E30D1C';
  }

  isGuestOutOfRange(pkg: PartyPackage): boolean {
    const g = this.guestCount();
    return g < pkg.min_guests || g > pkg.max_guests;
  }

  // ── Step 4: Snack ─────────────────────────────────────────
  selectSnack(snack: SnackOption): void {
    this.selectedSnack.set(snack);
    this.skipSnack.set(false);
  }

  setSkipSnack(): void {
    this.selectedSnack.set(null);
    this.skipSnack.set(true);
  }

  // ── Step 5: Extras ────────────────────────────────────────
  getExtraQty(extraId: string): number {
    return this.extraQty().get(extraId) ?? 0;
  }

  setExtraQty(extraId: string, delta: number): void {
    const map = new Map(this.extraQty());
    const current = map.get(extraId) ?? 0;
    const next = Math.max(0, current + delta);
    if (next === 0) map.delete(extraId);
    else map.set(extraId, next);
    this.extraQty.set(map);
  }

  // ── Submit wizard ─────────────────────────────────────────
  async onSubmit(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);

    const payload = {
      client_id:      this.selectedClient()?.id,
      fecha:          this.todayStr(),
      fecha_evento:   this.selectedDate() || undefined,
      hora_inicio:    this.selectedSlot()?.start_time,
      hora_fin:       this.selectedSlot()?.end_time,
      guest_count:    this.guestCount(),
      estado:         'borrador' as QuoteStatus,
      subtotal:       this.subtotalAmount(),
      descuento:      this.discount(),
      total:          this.totalAmount(),
      deposit_amount: this.depositAmount(),
      notas:          this.notes().trim() || undefined,
      items:          this.summaryItems().map((it) => ({
        descripcion:     it.descripcion,
        cantidad:        it.cantidad,
        precio_unitario: it.precio_unitario,
      })),
    };

    let result: Quote | null;
    const editing = this.editingQuote();
    if (editing) {
      result = await this.quoteService.updateFull(editing.id, payload);
    } else {
      result = await this.quoteService.create(payload);
    }

    if (result) {
      await this.refreshQuotes();
      this.closeDrawer();
      this.showToast('success', editing ? 'Cotización actualizada' : 'Cotización creada');
    } else {
      this.showToast('error', 'Ocurrió un error. Intenta de nuevo.');
    }
    this.saving.set(false);
    this.cdr.detectChanges();
  }

  // ── Status actions ────────────────────────────────────────
  async changeStatus(quote: Quote, estado: QuoteStatus): Promise<void> {
    const ok = await this.quoteService.updateStatus(quote.id, estado);
    if (ok) {
      this.quotes.update((list) => list.map((q) => (q.id === quote.id ? { ...q, estado } : q)));
      this.showToast('success', `Estado: ${STATUS_CONFIG[estado].label}`);
    }
    this.cdr.detectChanges();
  }

  confirmDelete(quote: Quote): void { this.deleteTarget.set(quote); }
  cancelDelete(): void              { this.deleteTarget.set(null); }

  async executeDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    const ok = await this.quoteService.delete(target.id);
    if (ok) {
      this.quotes.update((list) => list.filter((q) => q.id !== target.id));
      this.showToast('success', 'Cotización eliminada');
    } else {
      this.showToast('error', 'No se pudo eliminar');
    }
    this.deleteTarget.set(null);
    this.cdr.detectChanges();
  }

  // ── Anticipo dialog — convert quote to signed contract ────
  openAnticoDialog(quote: Quote): void {
    this.anticoDialog.set(quote);
    this.anticoMonto.set(quote.deposit_amount ?? quote.total);
    this.anticoFecha.set(this.todayStr());
    this.anticoMetodo.set('efectivo');
  }

  closeAnticoDialog(): void {
    this.anticoDialog.set(null);
  }

  async submitAnticipo(): Promise<void> {
    const quote = this.anticoDialog();
    if (!quote || this.anticoSaving()) return;

    const monto = this.anticoMonto();
    if (monto <= 0) {
      this.showToast('error', 'El monto debe ser mayor a cero');
      return;
    }

    this.anticoSaving.set(true);

    const contract = await this.contractService.create({
      quote_id:        quote.id,
      client_id:       quote.client_id ?? undefined,
      fecha_evento:    quote.fecha_evento ?? this.todayStr(),
      hora_inicio:     quote.hora_inicio ?? undefined,
      hora_fin:        quote.hora_fin ?? undefined,
      salon_renta:     0,
      total_contrato:  quote.total,
      deposito_pagado: monto,
      estado:          'firmado',
      notas:           quote.notas ?? undefined,
    });

    if (!contract) {
      this.showToast('error', 'No se pudo crear el contrato');
      this.anticoSaving.set(false);
      return;
    }

    // Register the payment record
    await this.contractService.addPayment(contract.id, {
      monto,
      fecha:  this.anticoFecha(),
      metodo: this.anticoMetodo(),
      notas:  `Anticipo — cotización ${quote.folio}`,
    });

    // Mark quote as approved
    await this.quoteService.updateStatus(quote.id, 'aprobada');
    this.quotes.update((list) =>
      list.map((q) => (q.id === quote.id ? { ...q, estado: 'aprobada' as QuoteStatus } : q)),
    );

    this.closeAnticoDialog();
    this.showToast('success', `Contrato ${contract.folio} creado — anticipo registrado`);
    this.anticoSaving.set(false);
    this.cdr.detectChanges();
  }

  // ── Send (WhatsApp / Email) ───────────────────────────────
  openSendPanel(quote: Quote): void {
    this.sendTarget.set(quote);
    this.sendMessage.set(this.buildWhatsAppMessage(quote));
  }

  closeSendPanel(): void { this.sendTarget.set(null); }

  sendViaWhatsApp(quote: Quote): void {
    const phone = quote.client?.telefono?.replace(/\D/g, '') ?? '';
    const text = encodeURIComponent(this.sendMessage());
    const url = phone
      ? `https://wa.me/52${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
    void this.markAsSent(quote);
    this.closeSendPanel();
  }

  sendViaEmail(quote: Quote): void {
    const email = quote.client?.email ?? '';
    const subject = encodeURIComponent(`Cotización ${quote.folio} — Hula Hoop`);
    const body = encodeURIComponent(this.buildEmailBody(quote));
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    void this.markAsSent(quote);
    this.closeSendPanel();
  }

  // ── Public link ───────────────────────────────────────────
  getPublicUrl(quote: Quote): string {
    return `${window.location.origin}/cotizacion/${quote.public_token}`;
  }

  copyPublicUrl(quote: Quote): void {
    navigator.clipboard
      .writeText(this.getPublicUrl(quote))
      .then(() => this.showToast('success', 'Link copiado al portapapeles'))
      .catch(() => this.showToast('error', 'No se pudo copiar el link'));
  }

  // ── PDF ───────────────────────────────────────────────────
  downloadPdf(quote: Quote): void {
    const win = window.open('', '_blank');
    if (!win) return;

    const fecha = quote.fecha_evento
      ? new Date(quote.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' })
      : '—';
    const itemRows = (quote.items ?? [])
      .map(
        (it) =>
          `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${it.descripcion}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center">${it.cantidad}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right">$${it.precio_unitario.toLocaleString('es-MX')}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">$${(it.cantidad * it.precio_unitario).toLocaleString('es-MX')}</td>
          </tr>`,
      )
      .join('');

    win.document.write(`<!DOCTYPE html><html lang="es"><head>
      <meta charset="UTF-8">
      <title>Cotización ${quote.folio}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;background:#fff;padding:40px}
        .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:3px solid #E30D1C}
        .logo{font-size:28px;font-weight:800;color:#E30D1C}
        .folio{font-size:18px;font-weight:700;color:#475569}
        .meta{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
        .meta-block h4{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:4px}
        .meta-block p{font-size:15px;font-weight:600;color:#1e293b}
        table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px}
        thead tr{background:#f8fafc}
        thead th{padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
        thead th:last-child,thead th:nth-child(3),thead th:nth-child(2){text-align:right}
        thead th:nth-child(2){text-align:center}
        .totals{width:300px;margin-left:auto}
        .totals tr td{padding:6px 12px;font-size:14px}
        .totals tr td:last-child{text-align:right;font-weight:600}
        .totals .total-row td{font-size:16px;font-weight:800;color:#1e293b;border-top:2px solid #e2e8f0;padding-top:12px}
        .deposit-row td{color:#E30D1C;font-size:15px;font-weight:700}
        .balance-row td{color:#64748b}
        .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center}
        @media print{body{padding:20px}}
      </style>
    </head><body>
      <div class="header">
        <div class="logo">Hula Hoop</div>
        <div style="text-align:right">
          <div class="folio">${quote.folio}</div>
          <div style="font-size:13px;color:#64748b;margin-top:4px">Fecha: ${new Date(quote.fecha + 'T12:00:00').toLocaleDateString('es-MX')}</div>
        </div>
      </div>
      <div class="meta">
        <div class="meta-block">
          <h4>Cliente</h4>
          <p>${quote.client?.nombre ?? 'Sin cliente'}</p>
          ${quote.client?.telefono ? `<p style="font-size:13px;color:#64748b;margin-top:2px">${quote.client.telefono}</p>` : ''}
          ${quote.client?.email ? `<p style="font-size:13px;color:#64748b">${quote.client.email}</p>` : ''}
        </div>
        <div class="meta-block">
          <h4>Evento</h4>
          <p>${fecha}</p>
          ${quote.hora_inicio ? `<p style="font-size:13px;color:#64748b;margin-top:2px">${quote.hora_inicio}${quote.hora_fin ? ' – ' + quote.hora_fin : ''}</p>` : ''}
          ${quote.guest_count ? `<p style="font-size:13px;color:#64748b">${quote.guest_count} invitados</p>` : ''}
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Descripción</th><th style="text-align:center">Cant.</th>
          <th style="text-align:right">Precio unit.</th><th style="text-align:right">Subtotal</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table class="totals">
        <tr><td>Subtotal</td><td>$${quote.subtotal.toLocaleString('es-MX')}</td></tr>
        ${quote.descuento > 0 ? `<tr><td>Descuento</td><td>-$${quote.descuento.toLocaleString('es-MX')}</td></tr>` : ''}
        <tr class="total-row"><td>Total</td><td>$${quote.total.toLocaleString('es-MX')}</td></tr>
        ${(quote.deposit_amount ?? 0) > 0 ? `<tr class="deposit-row"><td>Anticipo requerido</td><td>$${(quote.deposit_amount ?? 0).toLocaleString('es-MX')}</td></tr>` : ''}
        ${(quote.deposit_amount ?? 0) > 0 && (quote.total - (quote.deposit_amount ?? 0)) > 0 ? `<tr class="balance-row"><td>Saldo al evento</td><td>$${(quote.total - (quote.deposit_amount ?? 0)).toLocaleString('es-MX')}</td></tr>` : ''}
      </table>
      ${quote.notas ? `<div style="background:#f8fafc;padding:16px;border-radius:8px;margin-top:16px;font-size:13px"><strong>Notas:</strong> ${quote.notas}</div>` : ''}
      <div class="footer">Esta cotización fue generada por Hula Hoop · Válida por 15 días</div>
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  // ── Helpers ───────────────────────────────────────────────
  setStatusFilter(val: QuoteStatus | 'all'): void { this.statusFilter.set(val); }

  formatDate(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  formatDepositLabel(pkg: PartyPackage): string {
    switch (pkg.deposit_type) {
      case 'full':       return 'Pago completo';
      case 'percentage': return `${pkg.deposit_value}% de anticipo`;
      case 'fixed':      return `$${(pkg.deposit_value / 100).toLocaleString('es-MX')} de anticipo`;
    }
  }

  private async markAsSent(quote: Quote): Promise<void> {
    if (quote.estado === 'borrador') {
      const ok = await this.quoteService.updateStatus(quote.id, 'enviada');
      if (ok) {
        this.quotes.update((list) =>
          list.map((q) => (q.id === quote.id ? { ...q, estado: 'enviada' as QuoteStatus } : q)),
        );
      }
    }
  }

  private buildWhatsAppMessage(quote: Quote): string {
    const client = quote.client?.nombre ?? 'Cliente';
    const fecha = quote.fecha_evento
      ? new Date(quote.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' })
      : '';
    const horario = quote.hora_inicio
      ? `${quote.hora_inicio}${quote.hora_fin ? ' – ' + quote.hora_fin : ''}`
      : '';
    const items = (quote.items ?? [])
      .map((it) => `  • ${it.descripcion} x${it.cantidad} — $${(it.cantidad * it.precio_unitario).toLocaleString('es-MX')}`)
      .join('\n');
    const publicUrl = this.getPublicUrl(quote);

    return [
      `Hola ${client}, te comparto tu cotización *${quote.folio}* de Hula Hoop 🎉`,
      '',
      fecha   ? `📅 Fecha evento: ${fecha}` : '',
      horario ? `⏰ Horario: ${horario}` : '',
      quote.guest_count ? `👥 Invitados: ${quote.guest_count}` : '',
      '',
      '📋 *Conceptos:*',
      items,
      '',
      `Subtotal: $${quote.subtotal.toLocaleString('es-MX')}`,
      quote.descuento > 0 ? `Descuento: -$${quote.descuento.toLocaleString('es-MX')}` : '',
      `*Total: $${quote.total.toLocaleString('es-MX')}*`,
      (quote.deposit_amount ?? 0) > 0 ? `*Anticipo requerido: $${(quote.deposit_amount ?? 0).toLocaleString('es-MX')}*` : '',
      '',
      quote.notas ? `📝 Notas: ${quote.notas}` : '',
      '',
      `🔗 Ver tu cotización en línea: ${publicUrl}`,
      '',
      '¿Tienes alguna pregunta? Estamos para ayudarte. 😊',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildEmailBody(quote: Quote): string {
    const client = quote.client?.nombre ?? 'Cliente';
    const fecha = quote.fecha_evento
      ? new Date(quote.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' })
      : '';
    const items = (quote.items ?? [])
      .map((it) => `• ${it.descripcion} x${it.cantidad}: $${(it.cantidad * it.precio_unitario).toLocaleString('es-MX')}`)
      .join('\n');
    const publicUrl = this.getPublicUrl(quote);

    return [
      `Hola ${client},`,
      '',
      `Adjuntamos tu cotización ${quote.folio}:`,
      '',
      fecha ? `Fecha del evento: ${fecha}` : '',
      quote.hora_inicio ? `Horario: ${quote.hora_inicio} – ${quote.hora_fin ?? ''}` : '',
      quote.guest_count ? `Invitados: ${quote.guest_count}` : '',
      '',
      'CONCEPTOS:',
      items,
      '',
      `Subtotal: $${quote.subtotal.toLocaleString('es-MX')}`,
      quote.descuento > 0 ? `Descuento: -$${quote.descuento.toLocaleString('es-MX')}` : '',
      `Total: $${quote.total.toLocaleString('es-MX')}`,
      (quote.deposit_amount ?? 0) > 0 ? `Anticipo requerido: $${(quote.deposit_amount ?? 0).toLocaleString('es-MX')}` : '',
      '',
      `Ver cotización en línea: ${publicUrl}`,
      '',
      quote.notas ? `Notas: ${quote.notas}` : '',
      '',
      'Gracias por su preferencia,',
      'Equipo Hula Hoop',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async refreshQuotes(): Promise<void> {
    const quotes = await this.quoteService.getAll();
    this.quotes.set(quotes);
    this.cdr.detectChanges();
  }

  private resetWizard(): void {
    this.wizardStep.set(1);
    this.selectedClient.set(null);
    this.clientQuery.set('');
    this.clientDropdownOpen.set(false);
    this.showCreateClient.set(false);
    this.newClientName.set('');
    this.newClientPhone.set('');
    this.newClientEmail.set('');
    this.guestCount.set(10);
    this.selectedDate.set('');
    this.selectedSlot.set(null);
    this.daySlots.set([]);
    this.selectedPackage.set(null);
    this.selectedSnack.set(null);
    this.skipSnack.set(false);
    this.extraQty.set(new Map());
    this.discount.set(0);
    this.notes.set('');
    this.editingQuote.set(null);
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 3500);
  }
}
