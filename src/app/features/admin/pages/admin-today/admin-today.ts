import {
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContractService } from '../../../../core/services/contract.service';
import { ReservationService } from '../../../../core/services/reservation.service';
import { ReportService } from '../../../../core/services/report.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import type { Contract } from '../../../../core/interfaces/contract';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

interface TodayReservation {
  id: string;
  type: 'private' | 'playdate';
  guest_name: string;
  guest_phone: string;
  time_slot_label: string;
  status: string;
  total_cents: number;
  paid_deposit_cents: number;
}

interface StatusConfig {
  label: string;
  dot: string;
  bg: string;
  text: string;
}

@Component({
  selector: 'app-admin-today',
  templateUrl: './admin-today.html',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminToday implements OnInit {
  private readonly cdr             = inject(ChangeDetectorRef);
  private readonly contractService = inject(ContractService);
  private readonly reservationService = inject(ReservationService);
  private readonly reportService = inject(ReportService);
  private readonly timeSlotService = inject(TimeSlotService);
  private slotsMap = new Map<string, TimeSlot>();

  readonly loading = signal(true);
  readonly todayContracts = signal<Contract[]>([]);
  readonly todayReservations = signal<TodayReservation[]>([]);
  readonly lowStockCount = signal(0);
  readonly overdueCount = signal(0);

  readonly today = new Date();
  private readonly todayStr = this.today.toISOString().split('T')[0];

  readonly totalEvents = computed(
    () => this.todayContracts().length + this.todayReservations().length,
  );
  readonly totalAlerts = computed(() => {
    let n = 0;
    if (this.lowStockCount() > 0) n++;
    if (this.overdueCount() > 0) n++;
    return n;
  });

  async ngOnInit(): Promise<void> {
    const [contracts, privateRes, playdateRes, dash, slots] = await Promise.all([
      this.contractService.getUpcoming(1),
      this.reservationService.getAllPrivateReservations(),
      this.reservationService.getAllPlaydateReservations(),
      this.reportService.getDashboard(),
      this.timeSlotService.getActiveSlots(),
    ]);
    this.slotsMap = new Map(slots.map((s) => [s.id, s]));

    this.todayContracts.set(contracts.filter((c) => c.fecha_evento === this.todayStr));

    const allPrivate: TodayReservation[] = privateRes
      .filter((r) => r.reservation_date === this.todayStr)
      .map((r) => ({
        id: r.id,
        type: 'private' as const,
        guest_name: r.guest_name,
        guest_phone: r.guest_phone,
        time_slot_label: this.getSlotLabel(r.time_slot_id),
        status: r.status,
        total_cents: r.total_cents,
        paid_deposit_cents: r.paid_deposit_cents ?? 0,
      }));

    const allPlaydate: TodayReservation[] = playdateRes
      .filter((r) => r.reservation_date === this.todayStr)
      .map((r) => ({
        id: r.id,
        type: 'playdate' as const,
        guest_name: r.guest_name,
        guest_phone: r.guest_phone,
        time_slot_label: this.getSlotLabel(r.time_slot_id),
        status: r.status,
        total_cents: r.total_cents,
        paid_deposit_cents: r.paid_deposit_cents ?? 0,
      }));

    this.todayReservations.set([...allPrivate, ...allPlaydate]);
    this.lowStockCount.set(dash?.low_stock_count ?? 0);

    const overdue = contracts.filter(
      (c) => c.saldo_pendiente > 0 && c.estado !== 'cancelado' && c.fecha_evento < this.todayStr,
    );
    this.overdueCount.set(overdue.length);
    this.loading.set(false);
    this.cdr.markForCheck();
  }

  getStatusConfig(status: string): StatusConfig {
    const map: Record<string, StatusConfig> = {
      pending_payment: { label: 'Sin depósito', dot: 'bg-amber-400', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
      confirmed:       { label: 'Confirmado',   dot: 'bg-emerald-400', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
      completed:       { label: 'Completado',   dot: 'bg-slate-400', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600' },
      cancelled:       { label: 'Cancelado',    dot: 'bg-red-400', bg: 'bg-red-50 border-red-200', text: 'text-red-700' },
      expired:         { label: 'Expirado',     dot: 'bg-slate-300', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-500' },
      borrador:        { label: 'Borrador',     dot: 'bg-slate-300', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-500' },
      firmado:         { label: 'Contratado',   dot: 'bg-blue-400', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
      liquidado:       { label: 'Liquidado',    dot: 'bg-emerald-400', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
    };
    return map[status] ?? { label: status, dot: 'bg-slate-300', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600' };
  }

  private getSlotLabel(slotId: string): string {
    const s = this.slotsMap.get(slotId);
    if (!s) return '';
    const fmt = (t: string) => {
      const [h, m] = t.split(':');
      const hour = parseInt(h, 10);
      return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
    };
    return `${fmt(s.start_time)} – ${fmt(s.end_time)}`;
  }

  getDayGreeting(): string {
    const h = this.today.getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }
}
