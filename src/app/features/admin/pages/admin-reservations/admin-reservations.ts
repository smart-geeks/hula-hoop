import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { InputNumberModule } from 'primeng/inputnumber';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { ReservationService } from '../../../../core/services/reservation.service';
import { ReservationPrintService } from '../../../../core/services/reservation-print.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import type { PrivateReservation, PlaydateReservation, ReservationStatus } from '../../../../core/interfaces/reservation';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

interface ReservationExtra {
  name: string;
  quantity: number;
  unit_price_cents: number;
  pay_at_venue: boolean;
}

interface AdminReservationRow {
  id: string;
  type: 'private' | 'playdate';
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  reservation_date: string;
  time_slot_label: string;
  status: ReservationStatus;
  total_cents: number;
  subtotal_cents: number;
  deposit_cents: number;
  guest_count: number;
  notes: string;
  access_token: string;
  detail: string;
  created_at: string;
  snack_option_id: string | null;
  paid_deposit_cents: number;
  liquidation_date: string | null;
  raw_liquidation_date: string | null;
}

@Component({
  selector: 'app-admin-reservations',
  templateUrl: './admin-reservations.html',
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    TagModule,
    SelectModule,
    DatePickerModule,
    DialogModule,
    ToastModule,
    ConfirmDialogModule,
    TooltipModule,
    CurrencyMxnPipe,
    InputNumberModule,
    RouterLink,
  ],
  providers: [ConfirmationService, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReservations {
  private readonly reservationService = inject(ReservationService);
  private readonly timeSlotService = inject(TimeSlotService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly printService = inject(ReservationPrintService);

  readonly loading = signal(true);
  readonly allRows = signal<AdminReservationRow[]>([]);
  private slotsMap = new Map<string, TimeSlot>();

  // Filters
  readonly filterType = signal<string | null>(null);
  readonly filterStatus = signal<string | null>(null);
  readonly filterDate = signal<Date | null>(null);
  readonly filterLiquidation = signal<Date | null>(null);

  readonly typeOptions = [
    { label: 'Todos', value: null },
    { label: 'Fiesta Privada', value: 'private' },
    { label: 'Play Day', value: 'playdate' },
  ];

  readonly statusOptions = [
    { label: 'Todos', value: null },
    { label: 'Pendiente de pago', value: 'pending_payment' },
    { label: 'Confirmada', value: 'confirmed' },
    { label: 'Completada', value: 'completed' },
    { label: 'Cancelada', value: 'cancelled' },
    { label: 'Expirada', value: 'expired' },
  ];

  readonly statusChangeOptions: { label: string; value: ReservationStatus }[] = [
    { label: 'Pendiente de pago', value: 'pending_payment' },
    { label: 'Confirmada', value: 'confirmed' },
    { label: 'Completada', value: 'completed' },
    { label: 'Cancelada', value: 'cancelled' },
    { label: 'Expirada', value: 'expired' },
  ];

  // Detail dialog
  readonly detailVisible = signal(false);
  readonly detailRow = signal<AdminReservationRow | null>(null);
  readonly detailExtras = signal<ReservationExtra[]>([]);
  readonly detailSnackName = signal<string | null>(null);
  readonly detailLoading = signal(false);

  // Payment dialog
  readonly paymentVisible = signal(false);
  readonly paymentRow = signal<AdminReservationRow | null>(null);
  readonly paymentInput = signal<number>(0);
  readonly paymentSubmitting = signal(false);

  readonly filteredRows = computed(() => {
    let rows = this.allRows();
    const type = this.filterType();
    const status = this.filterStatus();
    const date = this.filterDate();
    const liquidation = this.filterLiquidation();

    if (type) {
      rows = rows.filter((r) => r.type === type);
    }
    if (status) {
      rows = rows.filter((r) => r.status === status);
    }
    if (date) {
      const dateStr = this.formatDateISO(date);
      rows = rows.filter((r) => r.reservation_date === dateStr);
    }
    if (liquidation) {
      const liqStr = this.formatDateISO(liquidation);
      rows = rows.filter((r) => r.raw_liquidation_date === liqStr);
    }
    return rows;
  });

  readonly stats = computed(() => {
    const rows = this.allRows();
    return {
      total: rows.length,
      pending: rows.filter((r) => r.status === 'pending_payment').length,
      confirmed: rows.filter((r) => r.status === 'confirmed').length,
      completed: rows.filter((r) => r.status === 'completed').length,
    };
  });

  constructor() {
    this.loadReservations();
  }

  async loadReservations(): Promise<void> {
    this.loading.set(true);

    const [privateRes, playdateRes, slots] = await Promise.all([
      this.reservationService.getAllPrivateReservations(),
      this.reservationService.getAllPlaydateReservations(),
      this.timeSlotService.getActiveSlots(),
    ]);

    // Build slots lookup map
    this.slotsMap = new Map(slots.map(s => [s.id, s]));

    const rows: AdminReservationRow[] = [
      ...privateRes.map((r) => this.mapPrivate(r)),
      ...playdateRes.map((r) => this.mapPlaydate(r)),
    ];

    rows.sort((a, b) => {
      const dateCmp = b.reservation_date.localeCompare(a.reservation_date);
      if (dateCmp !== 0) return dateCmp;
      return b.created_at.localeCompare(a.created_at);
    });

    this.allRows.set(rows);
    this.loading.set(false);

    // Auto-open payment dialog if redirected with state
    const state = window.history.state;
    if (state?.openPaymentFor) {
      const row = rows.find(r => r.id === state.openPaymentFor);
      if (row) {
        // Prevent opening again on page reload
        window.history.replaceState({}, '');
        this.openPayment(row);
      }
    }
  }

  confirmStatusChange(row: AdminReservationRow, newStatus: ReservationStatus): void {
    if (row.status === newStatus) return;

    const statusLabel = this.statusChangeOptions.find((o) => o.value === newStatus)?.label ?? newStatus;

    this.confirmationService.confirm({
      message: `¿Cambiar estado de la reserva de "${row.guest_name}" a "${statusLabel}"?`,
      header: 'Confirmar cambio de estado',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Cambiar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        let success: boolean;
        if (row.type === 'private') {
          success = await this.reservationService.updatePrivateReservationStatus(row.id, newStatus);
        } else {
          success = await this.reservationService.updatePlaydateReservationStatus(row.id, newStatus);
        }

        if (success) {
          this.messageService.add({ severity: 'success', summary: `Estado cambiado a "${statusLabel}"` });
          await this.loadReservations();
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error al cambiar estado' });
        }
      },
    });
  }

  async openDetail(row: AdminReservationRow): Promise<void> {
    this.detailRow.set(row);
    this.detailExtras.set([]);
    this.detailSnackName.set(null);
    this.detailVisible.set(true);

    if (row.type === 'private') {
      this.detailLoading.set(true);
      const extras = await this.reservationService.getPrivateReservationExtras(row.id);
      this.detailExtras.set(extras);
      if (row.snack_option_id) {
        const name = await this.reservationService.getSnackOptionName(row.snack_option_id);
        this.detailSnackName.set(name);
      }
      this.detailLoading.set(false);
    }
  }

  openPayment(row: AdminReservationRow): void {
    this.paymentRow.set(row);
    const remaining = row.total_cents - row.paid_deposit_cents;
    this.paymentInput.set(remaining > 0 ? remaining / 100 : 0); // Convert cents to whole currency for the input
    this.paymentVisible.set(true);
  }

  async submitPayment(): Promise<void> {
    const row = this.paymentRow();
    if (!row) return;

    const addedCents = Math.round(this.paymentInput() * 100);
    if (addedCents <= 0) {
      this.paymentVisible.set(false);
      return;
    }

    this.paymentSubmitting.set(true);
    const newPaidTotal = row.paid_deposit_cents + addedCents;

    let newStatus = row.status;
    if (row.status === 'pending_payment' && newPaidTotal >= row.deposit_cents) {
      newStatus = 'confirmed';
    }

    let success = false;
    if (row.type === 'private') {
      success = await this.reservationService.updatePrivateReservationPaidAmount(row.id, newPaidTotal, newStatus);
    } else {
      success = await this.reservationService.updatePlaydateReservationPaidAmount(row.id, newPaidTotal, newStatus);
    }

    if (success) {
      this.messageService.add({ severity: 'success', summary: 'Abono registrado con éxito' });
      await this.loadReservations();
      this.paymentVisible.set(false);
    } else {
      this.messageService.add({ severity: 'error', summary: 'Error al registrar abono' });
    }
    this.paymentSubmitting.set(false);
  }

  clearFilters(): void {
    this.filterType.set(null);
    this.filterStatus.set(null);
    this.filterDate.set(null);
    this.filterLiquidation.set(null);
  }

  printDetail(): void {
    const row = this.detailRow();
    if (!row) return;
    this.printService.print({
      type: row.type,
      statusLabel: this.getStatusConfig(row.status).label,
      guest_name: row.guest_name,
      guest_email: row.guest_email,
      guest_phone: row.guest_phone,
      reservation_date: this.formatDate(row.reservation_date),
      time_slot_label: row.time_slot_label,
      guest_count_label: row.type === 'private' ? `${row.guest_count} invitados` : row.detail,
      snack_name: this.detailSnackName(),
      notes: row.notes || null,
      extras: this.detailExtras(),
      subtotal_cents: row.subtotal_cents,
      total_cents: row.total_cents,
      paid_deposit_cents: row.paid_deposit_cents,
      liquidation_date: row.liquidation_date,
      access_token: row.access_token,
    });
  }

  shareWhatsApp(): void {
    const row = this.detailRow();
    if (!row) return;
    const url = this.printService.getWhatsAppUrl({
      type: row.type,
      statusLabel: this.getStatusConfig(row.status).label,
      guest_name: row.guest_name,
      guest_email: row.guest_email,
      guest_phone: row.guest_phone,
      reservation_date: this.formatDate(row.reservation_date),
      time_slot_label: row.time_slot_label,
      guest_count_label: row.type === 'private' ? `${row.guest_count} invitados` : row.detail,
      snack_name: this.detailSnackName(),
      notes: row.notes || null,
      extras: this.detailExtras(),
      subtotal_cents: row.subtotal_cents,
      total_cents: row.total_cents,
      paid_deposit_cents: row.paid_deposit_cents,
      liquidation_date: row.liquidation_date,
      access_token: row.access_token,
    });
    window.open(url, '_blank');
  }

  getStatusConfig(status: ReservationStatus): { label: string; severity: string } {
    switch (status) {
      case 'pending_payment':
        return { label: 'Pendiente', severity: 'warn' };
      case 'confirmed':
        return { label: 'Confirmada', severity: 'success' };
      case 'completed':
        return { label: 'Completada', severity: 'info' };
      case 'cancelled':
        return { label: 'Cancelada', severity: 'danger' };
      case 'expired':
        return { label: 'Expirada', severity: 'secondary' };
      default:
        return { label: status, severity: 'info' };
    }
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private formatDateISO(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private formatTime(time: string): string {
    const [h, m] = time.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  }

  private getSlotLabel(timeSlotId: string): string {
    const slot = this.slotsMap.get(timeSlotId);
    if (!slot) return '—';
    return `${this.formatTime(slot.start_time)} – ${this.formatTime(slot.end_time)}`;
  }

  private calculateRawLiquidationDate(reservationDate: string, daysToLiquidate: number): string | null {
    if (!daysToLiquidate) return null;
    const d = new Date(reservationDate + 'T12:00:00');
    d.setDate(d.getDate() - daysToLiquidate);
    return this.formatDateISO(d);
  }

  private mapPrivate(r: PrivateReservation): AdminReservationRow {
    return {
      id: r.id,
      type: 'private',
      guest_name: r.guest_name,
      guest_email: r.guest_email,
      guest_phone: r.guest_phone,
      reservation_date: r.reservation_date,
      time_slot_label: this.getSlotLabel(r.time_slot_id),
      status: r.status,
      total_cents: r.total_cents,
      subtotal_cents: r.subtotal_cents,
      deposit_cents: r.deposit_cents,
      guest_count: r.guest_count,
      notes: r.notes ?? '',
      access_token: r.access_token,
      detail: `${r.guest_count} invitados`,
      created_at: r.created_at,
      snack_option_id: r.snack_option_id,
      paid_deposit_cents: r.paid_deposit_cents ?? 0,
      liquidation_date: this.calculateRawLiquidationDate(r.reservation_date, r.packages?.days_to_liquidate ?? 0) ? this.formatDate(this.calculateRawLiquidationDate(r.reservation_date, r.packages?.days_to_liquidate ?? 0)!) : null,
      raw_liquidation_date: this.calculateRawLiquidationDate(r.reservation_date, r.packages?.days_to_liquidate ?? 0),
    };
  }

  private mapPlaydate(r: PlaydateReservation): AdminReservationRow {
    const totalAdults = r.adults_count + r.extra_adults_count;
    return {
      id: r.id,
      type: 'playdate',
      guest_name: r.guest_name,
      guest_email: r.guest_email,
      guest_phone: r.guest_phone,
      reservation_date: r.reservation_date,
      time_slot_label: this.getSlotLabel(r.time_slot_id),
      status: r.status,
      total_cents: r.total_cents,
      subtotal_cents: r.total_cents,
      deposit_cents: r.total_cents,
      guest_count: r.kids_count + r.adults_count + r.extra_adults_count,
      notes: '',
      access_token: r.access_token,
      detail: `${r.kids_count} niño(s), ${totalAdults} adulto(s)`,
      created_at: r.created_at,
      snack_option_id: null,
      paid_deposit_cents: r.paid_deposit_cents ?? 0,
      liquidation_date: null,
      raw_liquidation_date: null,
    };
  }
}
