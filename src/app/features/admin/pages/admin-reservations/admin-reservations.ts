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
import { PaymentSplitsInputComponent } from '../../../../shared/components/payment-splits-input/payment-splits-input';
import type { PaymentSplit } from '../../../../core/interfaces/contract';
import { ReservationService, type AvailablePlaydateSlot } from '../../../../core/services/reservation.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import { VenueService } from '../../../../core/services/venue.service';
import { VenueConfigService } from '../../../../core/services/venue-config.service';
import { PosTicketPrintService } from '../../../../core/services/pos-ticket-print.service';
import { InventoryService } from '../../../../core/services/inventory.service';
import type { InventoryItem } from '../../../../core/interfaces/inventory';
import type { PlaydateReservation, ReservationStatus } from '../../../../core/interfaces/reservation';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

export interface NewResProductLine {
  productId: string;
  cantidad: number;
}

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
    PaymentSplitsInputComponent,
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
  private readonly inventoryService   = inject(InventoryService);

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
  readonly paySplits         = signal<PaymentSplit[]>([]);
  readonly paySplitsValid    = computed(() => {
    const s = this.paySplits();
    return s.length > 0 && s.every(p => p.monto > 0);
  });
  readonly paySplitsTotal    = computed(() =>
    this.paySplits().reduce((sum, p) => sum + p.monto, 0)
  );
  readonly paymentRemaining  = computed(() => {
    const row = this.paymentRow();
    if (!row) return 0;
    const rem = row.total_cents - row.paid_deposit_cents;
    return rem > 0 ? rem / 100 : 0;
  });
  readonly paymentSubmitting = signal(false);

  // ── New reservation modal (Quick Checkout) ──────────────────────────────────
  readonly newResVisible       = signal(false);
  readonly newResDate          = signal<Date | null>(null);
  readonly newResSlots         = signal<AvailablePlaydateSlot[]>([]);
  readonly newResSlot          = signal<AvailablePlaydateSlot | null>(null);
  readonly newResSlotsLoading  = signal(false);
  readonly newResKids          = signal(1);
  readonly newResAdults        = signal(1);
  readonly newResExtraAdults   = signal(0);
  readonly newResName          = signal('');
  readonly newResSubmitting    = signal(false);
  readonly newResPaymentSplits = signal<PaymentSplit[]>([]);
  
  // Recepcion products management
  readonly recepcionItems      = signal<InventoryItem[]>([]);
  readonly newResProductLines  = signal<NewResProductLine[]>([]);

  private ticketPriceCents     = 20000; // default $200 MXN
  private extraAdultPriceCents = 7000;  // default $70 MXN
  private maxCapacityPerSlot   = 50;    // default fallback

  readonly newResTotal = computed(() => {
    const kids  = this.newResKids();
    const extra = this.newResExtraAdults();
    const baseTicketTotal = kids * this.ticketPriceCents + extra * this.extraAdultPriceCents;
    
    let productTotalCents = 0;
    const lines = this.newResProductLines();
    const items = this.recepcionItems();
    for (const line of lines) {
      const item = items.find(i => i.id === line.productId);
      if (item && line.cantidad > 0) {
        const priceCents = Math.round(Number(item.precio_venta) * 100);
        productTotalCents += priceCents * line.cantidad;
      }
    }
    
    return baseTicketTotal + productTotalCents;
  });

  readonly newResTicketSummary = computed(() => {
    const kids = this.newResKids();
    const extra = this.newResExtraAdults();
    const totalAdults = kids + extra;

    const kidLabel = kids === 1 ? '1 niño' : `${kids} niños`;
    const adultLabel = totalAdults === 1 ? '1 adulto' : `${totalAdults} adultos`;

    if (extra > 0) {
      const extraLabel = extra === 1 ? '1 adulto extra' : `${extra} adultos extras`;
      return `Boleto válido por ${kidLabel} y ${adultLabel} (${kids} niños + ${kids} adultos más ${extraLabel})`;
    }

    return `Boleto válido por ${kidLabel} y ${adultLabel} (${kids} niños + ${kids} adultos)`;
  });

  readonly newResPaymentSplitsTotal = computed(() =>
    this.newResPaymentSplits().reduce((sum, p) => sum + p.monto, 0)
  );

  readonly newResPaymentSplitsValid = computed(() => {
    const totalPesos = this.newResTotal() / 100;
    const sum = this.newResPaymentSplitsTotal();
    const hasRemainder = Math.abs(totalPesos - sum) > 0.01;
    
    const s = this.newResPaymentSplits();
    return s.length > 0 && s.every(p => p.monto > 0) && !hasRemainder;
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
      this.ticketPriceCents     = config.playdate_ticket_price_cents ?? 20000;
      this.extraAdultPriceCents = config.playdate_extra_adult_price_cents ?? 7000;
      this.maxCapacityPerSlot   = config.max_capacity_per_slot ?? 50;
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
    this.paySplits.set([]);
    this.paymentVisible.set(true);
  }

  async submitPayment(): Promise<void> {
    const row = this.paymentRow();
    if (!row) return;

    const splits    = this.paySplits();
    const addedCents = Math.round(this.paySplitsTotal() * 100);
    if (addedCents <= 0) { this.paymentVisible.set(false); return; }

    const metodo = splits.length === 1 ? splits[0].metodo : 'combinado';

    this.paymentSubmitting.set(true);
    const newPaid = row.paid_deposit_cents + addedCents;
    const newStatus: ReservationStatus =
      row.status === 'pending_payment' && newPaid >= row.total_cents
        ? 'confirmed'
        : row.status;

    const ok = await this.reservationService.updatePlaydateReservationPaidAmount(
      row.id, newPaid, newStatus, metodo, splits,
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

  // ── New reservation modal (Quick Checkout) ──────────────────────────────────
  async openNewReservation(): Promise<void> {
    this.newResKids.set(1);
    this.newResAdults.set(1);
    this.newResExtraAdults.set(0);
    this.newResName.set('');
    this.newResVisible.set(true);

    // Load products of category 'recepcion'
    try {
      const items = await this.inventoryService.getAll(false);
      const filtered = items.filter(i => i.categoria === 'recepcion');
      this.recepcionItems.set(filtered);

      // Default item is 'Calcetines' with quantity 0
      const socks = filtered.find(i => i.nombre.toLowerCase().includes('calcetin') || i.nombre.toLowerCase().includes('calceta'));
      if (socks) {
        this.newResProductLines.set([{ productId: socks.id, cantidad: 0 }]);
      } else if (filtered.length > 0) {
        this.newResProductLines.set([{ productId: filtered[0].id, cantidad: 0 }]);
      } else {
        this.newResProductLines.set([]);
      }
    } catch (err) {
      console.error('Error loading recepcion items:', err);
      this.recepcionItems.set([]);
      this.newResProductLines.set([]);
    }

    // Initial default split
    const initialTotalPesos = this.newResTotal() / 100;
    this.newResPaymentSplits.set([{ metodo: 'efectivo', monto: initialTotalPesos }]);

    // Auto-detect slot and availability in background
    const today = new Date();
    this.newResDate.set(today);
    
    this.newResSlotsLoading.set(true);
    const maxCapacity = this.maxCapacityPerSlot;
    try {
      const slots = await this.reservationService.getPlaydateSlotsForDate(
        today, this.allActiveSlots, maxCapacity
      );
      this.newResSlots.set(slots);

      if (slots.length > 0) {
        // Detect slot based on current time
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        
        const parseTimeToMinutes = (timeStr: string): number => {
          const [h, m] = timeStr.split(':').map(Number);
          return h * 60 + m;
        };

        let matchedSlot = slots.find(s => {
          const start = parseTimeToMinutes(s.slot.start_time);
          const end = parseTimeToMinutes(s.slot.end_time);
          return currentMinutes >= start && currentMinutes <= end;
        });

        // Default to first slot if none match
        if (!matchedSlot) {
          matchedSlot = slots[0];
        }

        this.newResSlot.set(matchedSlot);
      } else {
        this.newResSlot.set(null);
      }
    } catch (err) {
      console.error('Error auto-detecting slot:', err);
      this.newResSlot.set(null);
    } finally {
      this.newResSlotsLoading.set(false);
    }
  }

  addNewResProductLine(): void {
    const items = this.recepcionItems();
    if (items.length === 0) return;
    
    const socks = items.find(i => i.nombre.toLowerCase().includes('calcetin') || i.nombre.toLowerCase().includes('calceta'));
    const defaultId = socks?.id ?? items[0].id;

    this.newResProductLines.update(lines => [...lines, { productId: defaultId, cantidad: 1 }]);
    this.resetSplits();
  }

  updateNewResProductItem(idx: number, productId: string): void {
    this.newResProductLines.update(lines => {
      const copy = [...lines];
      if (copy[idx]) {
        copy[idx] = { ...copy[idx], productId };
      }
      return copy;
    });
    this.resetSplits();
  }

  updateNewResProductQty(idx: number, qty: number): void {
    const validQty = Math.max(0, qty);
    this.newResProductLines.update(lines => {
      const copy = [...lines];
      if (copy[idx]) {
        copy[idx] = { ...copy[idx], cantidad: validQty };
      }
      return copy;
    });
    this.resetSplits();
  }

  removeNewResProductLine(idx: number): void {
    this.newResProductLines.update(lines => lines.filter((_, i) => i !== idx));
    this.resetSplits();
  }

  updateNewResKids(n: number): void {
    const kids = Math.max(1, n);
    this.newResKids.set(kids);
    this.newResAdults.set(kids);
    this.resetSplits();
  }

  updateNewResExtraAdults(n: number): void {
    this.newResExtraAdults.set(Math.max(0, n));
    this.resetSplits();
  }

  private resetSplits(): void {
    const totalPesos = this.newResTotal() / 100;
    const current = this.newResPaymentSplits();
    if (current.length <= 1) {
      const method = current[0]?.metodo ?? 'efectivo';
      this.newResPaymentSplits.set([{ metodo: method, monto: totalPesos }]);
    } else {
      this.newResPaymentSplits.set([{ metodo: 'efectivo', monto: totalPesos }]);
    }
  }

  async submitNewReservation(): Promise<void> {
    const slot = this.newResSlot();
    const date = this.newResDate();
    if (!slot || !date) return;

    const name  = this.newResName().trim();
    if (!name) {
      this.messageService.add({ severity: 'warn', summary: 'El nombre es requerido' });
      return;
    }

    // Verify splits are valid
    const totalPesos = this.newResTotal() / 100;
    const splits = this.newResPaymentSplits();
    const sumSplits = splits.reduce((s, p) => s + (p.monto || 0), 0);
    const hasRemainder = Math.abs(totalPesos - sumSplits) > 0.01;
    const splitsValid = splits.length > 0 && splits.every(p => p.monto > 0) && !hasRemainder;

    if (!splitsValid) {
      this.messageService.add({ severity: 'warn', summary: 'El monto de pago debe coincidir exactamente con el total' });
      return;
    }

    this.newResSubmitting.set(true);
    const venueId = this.venueService.currentVenueId() ?? '00000000-0000-0000-0000-000000000001';

    try {
      const res = await this.reservationService.createPlaydateReservation({
        venue_id:           venueId,
        profile_id:         null,
        guest_name:         name,
        guest_email:        "",
        guest_phone:        "",
        reservation_date:   slot.date,
        time_slot_id:       slot.slot.id,
        kids_count:         this.newResKids(),
        adults_count:       this.newResAdults(),
        extra_adults_count: this.newResExtraAdults(),
        total_cents:        this.newResTotal(),
      });

      if (res) {
        // Register payment
        const addedCents = Math.round(sumSplits * 100);
        const metodo = splits.length === 1 ? splits[0].metodo : 'combinado';
        const newStatus: ReservationStatus = addedCents >= res.total_cents ? 'confirmed' : 'pending_payment';

        const paymentOk = await this.reservationService.updatePlaydateReservationPaidAmount(
          res.id, addedCents, newStatus, metodo, splits
        );

        if (paymentOk) {
          this.messageService.add({ severity: 'success', summary: 'Reserva creada y pago registrado' });

          // Register inventory movements for product lines with qty > 0
          const lines = this.newResProductLines();
          for (const line of lines) {
            if (line.cantidad > 0) {
              try {
                await this.inventoryService.registerMovement({
                  item_id: line.productId,
                  tipo: 'salida',
                  cantidad: line.cantidad,
                  motivo: `Venta Play Day - Reserva: ${res.guest_name}`,
                });
              } catch (err) {
                console.error('Error registering product movement:', err);
              }
            }
          }
          
          // Print ticket if confirmed
          if (newStatus === 'confirmed') {
            const mappedRow = this.mapPlaydate({
              ...res,
              status: newStatus,
              paid_deposit_cents: addedCents
            });
            this.printTicket(mappedRow);
          }
        } else {
          this.messageService.add({ severity: 'warn', summary: 'Reserva creada, pero hubo un problema al registrar el pago' });
        }

        this.newResVisible.set(false);
        await this.loadData();
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error al crear la reserva' });
      }
    } catch (error: any) {
      console.error(error);
      this.messageService.add({ severity: 'error', summary: error.message || 'Error al procesar la reserva' });
    } finally {
      this.newResSubmitting.set(false);
    }
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
