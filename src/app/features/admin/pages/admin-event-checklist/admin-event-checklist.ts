import {
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EventTaskService } from '../../../../core/services/event-task.service';
import { ContractService } from '../../../../core/services/contract.service';
import type { EventTask, TaskStatus } from '../../../../core/interfaces/event-task';
import type { Contract } from '../../../../core/interfaces/contract';

@Component({
  selector: 'app-admin-event-checklist',
  templateUrl: './admin-event-checklist.html',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminEventChecklist implements OnInit {
  private readonly cdr             = inject(ChangeDetectorRef);
  private readonly eventTaskService = inject(EventTaskService);
  private readonly contractService = inject(ContractService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  readonly loading = signal(true);
  readonly saving = signal<string | null>(null); // task id being saved
  readonly contract = signal<Contract | null>(null);
  readonly tasks = signal<EventTask[]>([]);

  readonly completedCount = computed(
    () => this.tasks().filter((t) => t.estado === 'completado').length,
  );
  readonly totalCount = computed(() => this.tasks().length);
  readonly progress = computed(() =>
    this.totalCount() > 0
      ? Math.round((this.completedCount() / this.totalCount()) * 100)
      : 0,
  );

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    const [contract, tasks] = await Promise.all([
      this.contractService.getById(id),
      this.eventTaskService.getByContract(id),
    ]);

    this.contract.set(contract);
    this.tasks.set(
      [...tasks].sort((a, b) => {
        if (!a.hora_inicio && !b.hora_inicio) return 0;
        if (!a.hora_inicio) return 1;
        if (!b.hora_inicio) return -1;
        return a.hora_inicio.localeCompare(b.hora_inicio);
      }),
    );
    this.loading.set(false);
    this.cdr.markForCheck();
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
    const [h, m] = time.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  }
}
