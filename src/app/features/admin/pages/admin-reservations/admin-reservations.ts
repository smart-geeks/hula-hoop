import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { ReservationService } from '../../../../core/services/reservation.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import type { PrivateReservation, PlaydateReservation, ReservationStatus } from '../../../../core/interfaces/reservation';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

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
  access_token: string;
  detail: string;
  created_at: string;
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
    ToastModule,
    ConfirmDialogModule,
    TooltipModule,
    CurrencyMxnPipe,
  ],
  providers: [ConfirmationService, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReservations {
  private readonly reservationService = inject(ReservationService);
  private readonly timeSlotService = inject(TimeSlotService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  readonly loading = signal(true);
  readonly allRows = signal<AdminReservationRow[]>([]);
  private slotsMap = new Map<string, TimeSlot>();

  // Filters — defaults: confirmed + today
  readonly filterType = signal<string | null>(null);
  readonly filterStatus = signal<string | null>('confirmed');
  readonly filterDate = signal<Date | null>(new Date());

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

  readonly filteredRows = computed(() => {
    let rows = this.allRows();
    const type = this.filterType();
    const status = this.filterStatus();
    const date = this.filterDate();

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

  clearFilters(): void {
    this.filterType.set(null);
    this.filterStatus.set(null);
    this.filterDate.set(null);
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
      access_token: r.access_token,
      detail: `${r.guest_count} invitados`,
      created_at: r.created_at,
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
      access_token: r.access_token,
      detail: `${r.kids_count} niño(s), ${totalAdults} adulto(s)`,
      created_at: r.created_at,
    };
  }
}
