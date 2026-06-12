import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EventTaskService } from '../../../../core/services/event-task.service';
import { ContractService } from '../../../../core/services/contract.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import type { EventTask, TaskStatus } from '../../../../core/interfaces/event-task';
import type { Contract } from '../../../../core/interfaces/contract';

@Component({
  selector: 'app-admin-event-checklist',
  templateUrl: './admin-event-checklist.html',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminEventChecklist {
  private readonly eventTaskService = inject(EventTaskService);
  private readonly contractService = inject(ContractService);
  private readonly supabase = inject(SupabaseService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  readonly loading = signal(true);
  readonly saving = signal<string | null>(null); // task id being saved
  readonly contract = signal<Contract | null>(null);
  readonly tasks = signal<EventTask[]>([]);

  readonly showCreateDialog = signal(false);
  readonly profilesList = signal<any[]>([]);

  readonly completedCount = computed(
    () => this.tasks().filter((t) => t.estado === 'completado').length,
  );
  readonly totalCount = computed(() => this.tasks().length);
  readonly progress = computed(() =>
    this.totalCount() > 0
      ? Math.round((this.completedCount() / this.totalCount()) * 100)
      : 0,
  );

  constructor() {
    this.loadData();
  }

  private async loadData(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    const [contract, tasks] = await Promise.all([
      this.contractService.getById(id),
      this.eventTaskService.getByContract(id),
    ]);

    this.contract.set(contract);
    this.tasks.set(this.sortTasks(tasks));
    this.loading.set(false);
  }

  private sortTasks(tasks: EventTask[]): EventTask[] {
    return [...tasks].sort((a, b) => {
      if (!a.hora_inicio && !b.hora_inicio) return 0;
      if (!a.hora_inicio) return 1;
      if (!b.hora_inicio) return -1;
      return a.hora_inicio.localeCompare(b.hora_inicio);
    });
  }

  async toggleTask(task: EventTask): Promise<void> {
    if (this.saving() === task.id) return;
    const newStatus: TaskStatus =
      task.estado === 'completado' ? 'pendiente' : 'completado';
    this.saving.set(task.id);
    const ok = await this.eventTaskService.updateStatus(task.id, newStatus);
    if (ok) {
      this.tasks.update((all) =>
        all.map((t) => (t.id === task.id ? { ...t, estado: newStatus } : t)),
      );
    }
    this.saving.set(null);
  }

  async openCreateDialog(): Promise<void> {
    this.showCreateDialog.set(true);
    const client = this.supabase.client;
    if (client && this.profilesList().length === 0) {
      const { data } = await client
        .from('profiles')
        .select('id, full_name')
        .order('full_name');
      this.profilesList.set(data ?? []);
    }
  }

  async createTask(
    title: string,
    desc: string,
    time: string,
    assigneeId: string,
  ): Promise<void> {
    if (!title.trim() || !this.contract()) return;

    const contractId = this.contract()!.id;
    const dateStr = this.contract()!.fecha_evento;

    let startIso: string | null = null;
    let endIso: string | null = null;
    if (time) {
      startIso = new Date(`${dateStr}T${time}:00`).toISOString();
      const endMins = parseInt(time.split(':')[1], 10) + 30;
      const endHours = parseInt(time.split(':')[0], 10) + Math.floor(endMins / 60);
      const endFmt = `${String(endHours % 24).padStart(2, '0')}:${String(
        endMins % 60,
      ).padStart(2, '0')}`;
      endIso = new Date(`${dateStr}T${endFmt}:00`).toISOString();
    }

    const payload = {
      contract_id: contractId,
      titulo: title,
      descripcion: desc || undefined,
      asignado_a: assigneeId || undefined,
      hora_inicio: startIso || undefined,
      hora_fin: endIso || undefined,
      estado: 'pendiente' as const,
    };

    const created = await this.eventTaskService.create(payload);
    if (created) {
      const allTasks = await this.eventTaskService.getByContract(contractId);
      this.tasks.set(this.sortTasks(allTasks));
      this.showCreateDialog.set(false);
    }
  }

  goBack(): void {
    this.location.back();
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  formatTime(time: string): string {
    const timePart = time.includes('T') ? time.split('T')[1] : time;
    const [h, m] = timePart.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  }
}
