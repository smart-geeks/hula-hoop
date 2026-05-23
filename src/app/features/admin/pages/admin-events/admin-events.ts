import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ContractService } from '../../../../core/services/contract.service';
import { ReservationService } from '../../../../core/services/reservation.service';
import { EventTaskService } from '../../../../core/services/event-task.service';
import { getStatusCfg } from '../../../../core/utils/status-config';
import type { Contract } from '../../../../core/interfaces/contract';
import type { PrivateReservation } from '../../../../core/interfaces/reservation';
import type { EventTask, TaskStatus } from '../../../../core/interfaces/event-task';

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
type DetailTab = 'info' | 'tareas' | 'pagos';

@Component({
  selector: 'app-admin-events',
  templateUrl: './admin-events.html',
  imports: [RouterLink, CurrencyPipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminEvents {
  private readonly contractService    = inject(ContractService);
  private readonly reservationService = inject(ReservationService);
  private readonly eventTaskService   = inject(EventTaskService);
  private readonly router             = inject(Router);

  readonly loading       = signal(true);
  readonly events        = signal<EventItem[]>([]);
  readonly activeTab     = signal<ActiveTab>('all');
  readonly statusFilter  = signal<string>('all');
  readonly selectedEvent = signal<EventItem | null>(null);
  readonly searchQuery   = signal('');
  readonly detailTab     = signal<DetailTab>('info');
  readonly tasks         = signal<EventTask[]>([]);
  readonly tasksLoading  = signal(false);
  readonly taskSaving    = signal<string | null>(null);

  readonly completedTaskCount = computed(
    () => this.tasks().filter((t) => t.estado === 'completado').length,
  );

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

  readonly contractsCount    = computed(() => this.events().filter((e) => e.type === 'contract').length);
  readonly reservationsCount = computed(() => this.events().filter((e) => e.type === 'reservation').length);

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

  readonly filteredEvents = computed(() => {
    const tab    = this.activeTab();
    const status = this.statusFilter();
    const query  = this.searchQuery().toLowerCase().trim();

    return this.events().filter((e) => {
      if (tab === 'contratos'     && e.type !== 'contract')     return false;
      if (tab === 'reservaciones' && e.type !== 'reservation')  return false;
      if (status !== 'all' && e.estado !== status)              return false;
      if (query) {
        const haystack = `${e.cliente} ${e.folio} ${e.fecha}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  });

  constructor() {
    this.loadEvents();
  }

  private async loadEvents(): Promise<void> {
    const [contracts, reservations] = await Promise.all([
      this.contractService.getAll(),
      this.reservationService.getAllPrivateReservations(),
    ]);

    const contractItems: EventItem[] = contracts.map((c) => ({
      id:      c.id,
      type:    'contract',
      fecha:   c.fecha_evento,
      cliente: c.client?.nombre ?? 'Sin cliente',
      estado:  c.estado,
      total:   c.total_contrato,
      folio:   c.folio,
      saldo:   c.saldo_pendiente,
      raw:     c,
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

  setTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    this.statusFilter.set('all');
  }

  setStatusFilter(value: string): void { this.statusFilter.set(value); }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  onStatusSelectChange(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value);
  }

  selectEvent(item: EventItem): void {
    if (item.type === 'contract') {
      void this.router.navigate(['/admin/evento', item.id]);
      return;
    }
    this.selectedEvent.set(item);
    this.detailTab.set('info');
    this.tasks.set([]);
  }

  closePanel(): void {
    this.selectedEvent.set(null);
    this.tasks.set([]);
  }

  async setDetailTab(tab: DetailTab): Promise<void> {
    this.detailTab.set(tab);
    if (tab === 'tareas') {
      const event = this.selectedEvent();
      if (event?.type === 'contract' && this.tasks().length === 0) {
        this.tasksLoading.set(true);
        const tasks = await this.eventTaskService.getByContract(event.id);
        this.tasks.set(
          [...tasks].sort((a, b) => {
            if (!a.hora_inicio && !b.hora_inicio) return 0;
            if (!a.hora_inicio) return 1;
            if (!b.hora_inicio) return -1;
            return a.hora_inicio.localeCompare(b.hora_inicio);
          }),
        );
        this.tasksLoading.set(false);
      }
    }
  }

  async toggleTask(task: EventTask): Promise<void> {
    if (this.taskSaving() === task.id) return;
    const newStatus: TaskStatus = task.estado === 'completado' ? 'pendiente' : 'completado';
    this.taskSaving.set(task.id);
    const ok = await this.eventTaskService.updateStatus(task.id, newStatus);
    if (ok) {
      this.tasks.update((all) =>
        all.map((t) => (t.id === task.id ? { ...t, estado: newStatus } : t)),
      );
    }
    this.taskSaving.set(null);
  }

  formatTime(time: string): string {
    const [h, m] = time.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  }

  getStatusBadge(estado: string, type: 'contract' | 'reservation'): string {
    return getStatusCfg(estado, type === 'contract' ? 'contract' : 'reservation').classes;
  }

  getStatusLabel(estado: string, type: 'contract' | 'reservation'): string {
    return getStatusCfg(estado, type === 'contract' ? 'contract' : 'reservation').label;
  }

  getTypeIcon(type: 'contract' | 'reservation'): string {
    return type === 'contract' ? 'pi-file-edit' : 'pi-calendar';
  }

  asContract(raw: Contract | PrivateReservation): Contract {
    return raw as Contract;
  }

  asReservation(raw: Contract | PrivateReservation): PrivateReservation {
    return raw as PrivateReservation;
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private thisWeekRange(): { start: string; end: string } {
    const now  = new Date();
    const day  = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(now);
    start.setDate(diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    return { start: fmt(start), end: fmt(end) };
  }
}
