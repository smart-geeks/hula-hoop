import {
  ChangeDetectionStrategy, Component, computed, inject, signal,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
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
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { ReservationService, type AvailablePlaydateSlot } from '../../../../core/services/reservation.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import { VenueService } from '../../../../core/services/venue.service';
import { VenueConfigService } from '../../../../core/services/venue-config.service';
import { PosTicketPrintService } from '../../../../core/services/pos-ticket-print.service';
import type { PlaydateReservation, ReservationStatus } from '../../../../core/interfaces/reservation';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

interface PlayDayRow {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  reservation_date: string;
  time_slot_id: string;
  time_slot_label: string;
  status: ReservationStatus;
  total_cents: number;
  paid_deposit_cents: number;
  kids_count: number;
  adults_count: number;
  extra_adults_count: number;
  access_token: string;
  created_at: string;
  detail: string;
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
    InputTextModule,
    InputNumberModule,
    CurrencyMxnPipe,
    CurrencyPipe,
  ],
  providers: [ConfirmationService, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReservations {
  private readonly reservationService = inject(ReservationService);
  private readonly timeSlotService    = inject(TimeSlotService);
  private readonly venueService       = inject(VenueService);
  private readonly venueConfigService = inject(VenueConfigService);
  private readonly printService       = inject(PosTicketPrintService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService     = inject(MessageService);

  readonly loading = signal(true);
  readonly allRows = signal<PlayDayRow[]>([]);
  private slotsMap = new Map<string, TimeSlot>();
  private allActiveSlots: TimeSlot[] = [];

  // ── Filters ────────────────────────────────────────────────────────────────
  readonly filterSearch = signal('');
  readonly filterStatus = signal<string | null>(null);
  readonly filterDate   = signal<Date | null>(null);

  readonly statusOptions = [
    { label: 'Todos',              value: null },
    { label: 'Pendiente de pago',  value: 'pending_payment' },
    { label: 'Confirmada',         value: 'confirmed' },
    { label: 'Completada',         value: 'completed' },
    { label: 'Cancelada',          value: 'cancelled' },
  ];

  readonly statusChangeOptions: { label: string; value: ReservationStatus }[] = [
    { label: 'Pendiente de pago', value: 'pending_payment' },
    { label: 'Confirmada',        value: 'confirmed' },
    { label: 'Completada',        value: 'completed' },
    { label: 'Cancelada',         value: 'cancelled' },
  ];

  // ── Detail dialog ──────────────────────────────────────────────────────────
  readonly detailVisible = signal(false);
  readonly detailRow     = signal<PlayDayRow | null>(null);

  // ── Payment dialog ─────────────────────────────────────────────────────────
  readonly paymentVisible    = signal(false);
  readonly paymentRow        = signal<PlayDayRow | null>(null);
  readonly paymentInput      = signal<number>(0);
  readonly paymentSubmitting = signal(false);

  // ── New reservation modal ──────────────────────────────────────────────────
  readonly newResVisible      = signal(false);
  readonly newResStep         = signal<1 | 2 | 3>(1);
  readonly newResDate         = signal<Date | null>(null);
  readonly newResSlots        = signal<AvailablePlaydateSlot[]>([]);
  readonly newResSlot         = signal<AvailablePlaydateSlot | null>(null);
  readonly newResSlotsLoading = signal(false);
  readonly newResKids         = signal(1);
  readonly newResAdults       = signal(1);
  readonly newResExtraAdults  = signal(0);
  readonly newResName         = signal('');
  readonly newResEmail        = signal('');
  readonly newResPhone        = signal('');
  readonly newResSubmitting   = signal(false);

  private ticketPriceCents     = 19000;
  private extraAdultPriceCents = 6000;

  readonly newResTotal = computed(() => {
    const kids  = this.newResKids();
    const extra = this.newResExtraAdults();
    return kids * this.ticketPriceCents + extra * this.extraAdultPriceCents;
  });

  readonly newResMaxExtra = computed(() => {
    const slot = this.newResSlot();
    if (!slot) return 0;
    const used = this.newResKids() + this.newResAdults();
    return Math.max(0, slot.remaining - used);
  });

  // ── Computed ───────────────────────────────────────────────────────────────
  readonly filteredRows = computed(() => {
    let rows = this.allRows();
    const q      = this.filterSearch().toLowerCase().trim();
    const status = this.filterStatus();
    const date   = this.filterDate();

    if (q) {
      rows = rows.filter(r =>
        `${r.guest_name} ${r.guest_email} ${r.guest_phone}`.toLowerCase().includes(q),
      );
    }
    if (status) {
      rows = rows.filter(r => r.status === status);
    }
    if (date) {
      const ds = this.formatDateISO(date);
      rows = rows.filter(r => r.reservation_date === ds);
    }
    return rows;
  });

  readonly stats = computed(() => {
    const rows = this.allRows();
    return {
      total:     rows.length,
      pending:   rows.filter(r => r.status === 'pending_payment').length,
      confirmed: rows.filter(r => r.status === 'confirmed').length,
      completed: rows.filter(r => r.status === 'completed').length,
    };
  });

  constructor() {
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    const [playdates, slots, config] = await Promise.all([
      this.reservationService.getAllPlaydateReservations(),
      this.timeSlotService.getActiveSlots(),
      this.venueConfigService.getConfig(),
    ]);

    this.allActiveSlots = slots;
    this.slotsMap = new Map(slots.map(s => [s.id, s]));

    if (config) {
      this.ticketPriceCents     = config.playdate_ticket_price_cents ?? 19000;
      this.extraAdultPriceCents = config.playdate_extra_adult_price_cents ?? 6000;
    }

    const rows: PlayDayRow[] = playdates.map(r => this.mapPlaydate(r));
    rows.sort((a, b) => {
      const dc = b.reservation_date.localeCompare(a.reservation_date);
      return dc !== 0 ? dc : b.created_at.localeCompare(a.created_at);
    });

    this.allRows.set(rows);
    this.loading.set(false);

    // Auto-abrir pago si viene de router state
    const state = window.history.state;
    if (state?.openPaymentFor) {
      const row = rows.find(r => r.id === state.openPaymentFor);
      if (row) {
        window.history.replaceState({}, '');
        this.openPayment(row);
      }
    }
  }

  // ── Status change ──────────────────────────────────────────────────────────
  confirmStatusChange(row: PlayDayRow, newStatus: ReservationStatus): void {
    if (row.status === newStatus) return;
    const label = this.statusChangeOptions.find(o => o.value === newStatus)?.label ?? newStatus;
    this.confirmationService.confirm({
      message: `¿Cambiar estado de "${row.guest_name}" a "${label}"?`,
      header: 'Confirmar cambio de estado',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Cambiar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        const ok = await this.reservationService.updatePlaydateReservationStatus(row.id, newStatus);
        if (ok) {
          this.messageService.add({ severity: 'success', summary: `Estado cambiado a "${label}"` });
          await this.loadData();
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error al cambiar estado' });
        }
      },
    });
  }

  // ── Detail ─────────────────────────────────────────────────────────────────
  openDetail(row: PlayDayRow): void {
    this.detailRow.set(row);
    this.detailVisible.set(true);
  }

  // ── Payment ────────────────────────────────────────────────────────────────
  openPayment(row: PlayDayRow): void {
    this.paymentRow.set(row);
    const remaining = row.total_cents - row.paid_deposit_cents;
    this.paymentInput.set(remaining > 0 ? remaining / 100 : 0);
    this.paymentVisible.set(true);
  }

  async submitPayment(): Promise<void> {
    const row = this.paymentRow();
    if (!row) return;

    const addedCents = Math.round(this.paymentInput() * 100);
    if (addedCents <= 0) { this.paymentVisible.set(false); return; }

    this.paymentSubmitting.set(true);
    const newPaid = row.paid_deposit_cents + addedCents;
    const newStatus: ReservationStatus =
      row.status === 'pending_payment' && newPaid >= row.total_cents
        ? 'confirmed'
        : row.status;

    const ok = await this.reservationService.updatePlaydateReservationPaidAmount(
      row.id, newPaid, newStatus,
    );

    if (ok) {
      this.messageService.add({ severity: 'success', summary: 'Pago registrado' });
      await this.loadData();
      this.paymentVisible.set(false);

      // Ofrecer imprimir ticket si quedó confirmada
      if (newStatus === 'confirmed') {
        const updated = this.allRows().find(r => r.id === row.id);
        if (updated) this.printTicket(updated);
      }
    } else {
      this.messageService.add({ severity: 'error', summary: 'Error al registrar pago' });
    }
    this.paymentSubmitting.set(false);
  }

  // ── Print ──────────────────────────────────────────────────────────────────
  printTicket(row: PlayDayRow): void {
    this.printService.printPlaydateTicket({
      guestName:        row.guest_name,
      reservationDate:  row.reservation_date,
      slotLabel:        row.time_slot_label,
      kidsCount:        row.kids_count,
      adultsCount:      row.adults_count,
      extraAdultsCount: row.extra_adults_count,
      totalCents:       row.total_cents,
      accessToken:      row.access_token,
    });
  }

  // ── New reservation modal ──────────────────────────────────────────────────
  openNewReservation(): void {
    this.newResStep.set(1);
    this.newResDate.set(null);
    this.newResSlots.set([]);
    this.newResSlot.set(null);
    this.newResKids.set(1);
    this.newResAdults.set(1);
    this.newResExtraAdults.set(0);
    this.newResName.set('');
    this.newResEmail.set('');
    this.newResPhone.set('');
    this.newResVisible.set(true);
  }

  async onNewResDateChange(date: Date | null): Promise<void> {
    this.newResDate.set(date);
    this.newResSlot.set(null);
    this.newResSlots.set([]);
    if (!date) return;

    this.newResSlotsLoading.set(true);
    const maxCapacity = 50; // fallback; venue config loaded on init
    const slots = await this.reservationService.getPlaydateSlotsForDate(
      date, this.allActiveSlots, maxCapacity,
    );
    this.newResSlots.set(slots);
    this.newResSlotsLoading.set(false);
  }

  selectNewResSlot(slot: AvailablePlaydateSlot): void {
    this.newResSlot.set(slot);
    this.newResKids.set(1);
    this.newResAdults.set(1);
    this.newResExtraAdults.set(0);
  }

  updateNewResKids(n: number): void {
    const max = this.newResSlot()?.remaining ?? 1;
    const kids = Math.max(1, Math.min(n, max));
    this.newResKids.set(kids);
    this.newResAdults.set(kids);
    const maxExtra = Math.max(0, (this.newResSlot()?.remaining ?? 0) - kids - kids);
    if (this.newResExtraAdults() > maxExtra) this.newResExtraAdults.set(maxExtra);
  }

  updateNewResExtraAdults(n: number): void {
    this.newResExtraAdults.set(Math.max(0, Math.min(n, this.newResMaxExtra())));
  }

  goToStep(step: 1 | 2 | 3): void {
    this.newResStep.set(step);
  }

  async submitNewReservation(): Promise<void> {
    const slot = this.newResSlot();
    const date = this.newResDate();
    if (!slot || !date) return;

    const name  = this.newResName().trim();
    const phone = this.newResPhone().trim();
    if (!name) {
      this.messageService.add({ severity: 'warn', summary: 'El nombre es requerido' });
      return;
    }

    this.newResSubmitting.set(true);
    const venueId = this.venueService.currentVenueId() ?? '00000000-0000-0000-0000-000000000001';

    const res = await this.reservationService.createPlaydateReservation({
      venue_id:           venueId,
      profile_id:         null,
      guest_name:         name,
      guest_email:        this.newResEmail().trim(),
      guest_phone:        phone,
      reservation_date:   slot.date,
      time_slot_id:       slot.slot.id,
      kids_count:         this.newResKids(),
      adults_count:       this.newResAdults(),
      extra_adults_count: this.newResExtraAdults(),
      total_cents:        this.newResTotal(),
    });

    if (res) {
      this.messageService.add({ severity: 'success', summary: 'Reserva creada — pendiente de pago' });
      this.newResVisible.set(false);
      await this.loadData();
      // Auto-abrir dialogo de pago para la nueva reserva
      const newRow = this.allRows().find(r => r.id === res.id);
      if (newRow) this.openPayment(newRow);
    } else {
      this.messageService.add({ severity: 'error', summary: 'Error al crear la reserva' });
    }
    this.newResSubmitting.set(false);
  }

  // ── Filters ────────────────────────────────────────────────────────────────
  clearFilters(): void {
    this.filterSearch.set('');
    this.filterStatus.set(null);
    this.filterDate.set(null);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  getStatusConfig(status: ReservationStatus): { label: string; severity: string } {
    switch (status) {
      case 'pending_payment': return { label: 'Pendiente',   severity: 'warn' };
      case 'confirmed':       return { label: 'Confirmada',  severity: 'success' };
      case 'completed':       return { label: 'Completada',  severity: 'info' };
      case 'cancelled':       return { label: 'Cancelada',   severity: 'danger' };
      default:                return { label: status,        severity: 'info' };
    }
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatTime(time: string): string {
    const [h, m] = time.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${m} ${ampm}`;
  }

  private formatDateISO(date: Date): string {
    const y  = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d  = String(date.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }

  private getSlotLabel(id: string): string {
    const s = this.slotsMap.get(id);
    if (!s) return '—';
    return `${this.formatTime(s.start_time)} – ${this.formatTime(s.end_time)}`;
  }

  private mapPlaydate(r: PlaydateReservation): PlayDayRow {
    const totalAdults = r.adults_count + r.extra_adults_count;
    return {
      id:               r.id,
      guest_name:       r.guest_name,
      guest_email:      r.guest_email,
      guest_phone:      r.guest_phone,
      reservation_date: r.reservation_date,
      time_slot_id:     r.time_slot_id,
      time_slot_label:  this.getSlotLabel(r.time_slot_id),
      status:           r.status,
      total_cents:      r.total_cents,
      paid_deposit_cents: r.paid_deposit_cents ?? 0,
      kids_count:       r.kids_count,
      adults_count:     r.adults_count,
      extra_adults_count: r.extra_adults_count,
      access_token:     r.access_token,
      created_at:       r.created_at,
      detail:           `${r.kids_count} niño(s), ${totalAdults} adulto(s)`,
    };
  }
}
