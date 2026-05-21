import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { ContractService } from '../../../../core/services/contract.service';
import { ReservationService } from '../../../../core/services/reservation.service';
import type { Contract } from '../../../../core/interfaces/contract';
import type { PrivateReservation } from '../../../../core/interfaces/reservation';

export interface EventItem {
  id: string;
  type: 'contract' | 'reservation';
  fecha: string;
  cliente: string;
  estado: string;
  total: number;
  folio: string;
  saldo?: number;
  raw: Contract | PrivateReservation;
}

type ActiveTab = 'all' | 'contratos' | 'reservaciones';

@Component({
  selector: 'app-admin-events',
  templateUrl: './admin-events.html',
  imports: [RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminEvents implements OnInit {
  private readonly contractService    = inject(ContractService);
  private readonly reservationService = inject(ReservationService);

  // ── State ────────────────────────────────────────────────────
  readonly loading       = signal(true);
  readonly events        = signal<EventItem[]>([]);
  readonly activeTab     = signal<ActiveTab>('all');
  readonly statusFilter  = signal<string>('all');
  readonly selectedEvent = signal<EventItem | null>(null);
  readonly searchQuery   = signal('');

  // ── Computed: KPIs ───────────────────────────────────────────
  readonly todayCount = computed(() => {
    const today = this.todayStr();
    return this.events().filter((e) => e.fecha === today).length;
  });

  readonly thisWeekCount = computed(() => {
    const { start, end } = this.thisWeekRange();
    return this.events().filter((e) => e.fecha >= start && e.fecha <= end).length;
  });

  readonly pendingCount = computed(() =>
    this.events().filter((e) => (e.saldo ?? 0) > 0 || e.estado === 'pending_payment').length,
  );

  // ── Computed: Tab counts ─────────────────────────────────────
  readonly contractsCount    = computed(() => this.events().filter((e) => e.type === 'contract').length);
  readonly reservationsCount = computed(() => this.events().filter((e) => e.type === 'reservation').length);

  // ── Computed: Status options ─────────────────────────────────
  readonly statusOptions = computed(() => {
    const tab = this.activeTab();
    if (tab === 'contratos') {
      return [
        { value: 'all',       label: 'Todos los estados' },
        { value: 'borrador',  label: 'Borrador' },
        { value: 'firmado',   label: 'Contratado' },
        { value: 'liquidado', label: 'Liquidado' },
        { value: 'cancelado', label: 'Cancelado' },
      ];
    }
    if (tab === 'reservaciones') {
      return [
        { value: 'all',             label: 'Todos los estados' },
        { value: 'pending_payment', label: 'Pendiente de pago' },
        { value: 'confirmed',       label: 'Confirmada' },
        { value: 'completed',       label: 'Completada' },
        { value: 'cancelled',       label: 'Cancelada' },
        { value: 'expired',         label: 'Expirada' },
      ];
    }
    return [{ value: 'all', label: 'Todos los estados' }];
  });

  // ── Computed: Filtered list ──────────────────────────────────
  readonly filteredEvents = computed(() => {
    const tab    = this.activeTab();
    const status = this.statusFilter();
    const query  = this.searchQuery().toLowerCase().trim();

    return this.events().filter((e) => {
      if (tab === 'contratos'    && e.type !== 'contract')     return false;
      if (tab === 'reservaciones' && e.type !== 'reservation') return false;
      if (status !== 'all' && e.estado !== status)             return false;
      if (query) {
        const haystack = `${e.cliente} ${e.folio} ${e.fecha}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  });

  // ── Lifecycle ────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    const [contracts, reservations] = await Promise.all([
      this.contractService.getAll(),
      this.reservationService.getAllPrivateReservations(),
    ]);

    const contractItems: EventItem[] = contracts.map((c) => ({
      id:     c.id,
      type:   'contract',
      fecha:  c.fecha_evento,
      cliente: c.client?.nombre ?? 'Sin cliente',
      estado: c.estado,
      total:  c.total_contrato,
      folio:  c.folio,
      saldo:  c.saldo_pendiente,
      raw:    c,
    }));

    const reservationItems: EventItem[] = reservations.map((r) => ({
      id:      r.id,
      type:    'reservation',
      fecha:   r.reservation_date,
      cliente: r.guest_name,
      estado:  r.status,
      total:   r.total_cents / 100,
      folio:   r.id.slice(0, 8).toUpperCase(),
      saldo:   (r.total_cents - (r.paid_deposit_cents ?? 0)) / 100,
      raw:     r,
    }));

    const merged = [...contractItems, ...reservationItems].sort((a, b) =>
      b.fecha.localeCompare(a.fecha),
    );

    this.events.set(merged);
    this.loading.set(false);
  }

  // ── Tab / filter helpers ─────────────────────────────────────
  setTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    this.statusFilter.set('all');
  }

  setStatusFilter(value: string): void {
    this.statusFilter.set(value);
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  onStatusSelectChange(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value);
  }

  selectEvent(item: EventItem): void {
    this.selectedEvent.set(item);
  }

  closePanel(): void {
    this.selectedEvent.set(null);
  }

  // ── Badge helpers ────────────────────────────────────────────
  getStatusBadge(estado: string, type: 'contract' | 'reservation'): string {
    if (type === 'contract') {
      switch (estado) {
        case 'borrador':  return 'bg-slate-100 text-slate-600';
        case 'firmado':   return 'bg-blue-100 text-blue-700';
        case 'liquidado': return 'bg-emerald-100 text-emerald-700';
        case 'cancelado': return 'bg-red-100 text-red-700';
        default:          return 'bg-slate-100 text-slate-600';
      }
    }
    switch (estado) {
      case 'pending_payment': return 'bg-amber-100 text-amber-700';
      case 'confirmed':       return 'bg-blue-100 text-blue-700';
      case 'completed':       return 'bg-emerald-100 text-emerald-700';
      case 'cancelled':       return 'bg-red-100 text-red-700';
      case 'expired':         return 'bg-slate-100 text-slate-500';
      default:                return 'bg-slate-100 text-slate-600';
    }
  }

  getStatusLabel(estado: string, type: 'contract' | 'reservation'): string {
    if (type === 'contract') {
      switch (estado) {
        case 'borrador':  return 'Borrador';
        case 'firmado':   return 'Contratado';
        case 'liquidado': return 'Liquidado';
        case 'cancelado': return 'Cancelado';
        default:          return estado;
      }
    }
    switch (estado) {
      case 'pending_payment': return 'Pend. pago';
      case 'confirmed':       return 'Confirmada';
      case 'completed':       return 'Completada';
      case 'cancelled':       return 'Cancelada';
      case 'expired':         return 'Expirada';
      default:                return estado;
    }
  }

  getTypeIcon(type: 'contract' | 'reservation'): string {
    return type === 'contract' ? 'pi-file-edit' : 'pi-calendar';
  }

  // Cast helpers for detail panel (template cannot use type assertions)
  asContract(raw: Contract | PrivateReservation): Contract {
    return raw as Contract;
  }

  asReservation(raw: Contract | PrivateReservation): PrivateReservation {
    return raw as PrivateReservation;
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('es-MX', {
      day:   '2-digit',
      month: 'short',
      year:  'numeric',
    });
  }

  // ── Private utilities ────────────────────────────────────────
  private todayStr(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private thisWeekRange(): { start: string; end: string } {
    const now   = new Date();
    const day   = now.getDay(); // 0 = Sun
    const diff  = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const start = new Date(now);
    start.setDate(diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const fmt = (d: Date) => {
      const y  = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${da}`;
    };

    return { start: fmt(start), end: fmt(end) };
  }
}
