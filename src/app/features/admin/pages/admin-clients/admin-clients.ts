import {
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ClientService } from '../../../../core/services/client.service';
import type { Client } from '../../../../core/interfaces/client';

type DrawerMode = 'create' | 'edit';

@Component({
  selector: 'app-admin-clients',
  templateUrl: './admin-clients.html',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminClients implements OnInit {
  private readonly cdr             = inject(ChangeDetectorRef);
  private readonly clientService = inject(ClientService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly clients = signal<Client[]>([]);
  readonly searchQuery = signal('');
  readonly drawerOpen = signal(false);
  readonly drawerMode = signal<DrawerMode>('create');
  readonly selectedClient = signal<Client | null>(null);
  readonly deleteTarget = signal<Client | null>(null);
  readonly toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  readonly form = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    telefono: [''],
    email: ['', [Validators.email]],
    rfc: [''],
    notas: [''],
  });

  readonly filteredClients = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.clients();
    return this.clients().filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.telefono?.includes(q),
    );
  });

  async ngOnInit(): Promise<void> {
    await this.loadClients();
  }

  private async loadClients(): Promise<void> {
    this.loading.set(true);
    const data = await this.clientService.getAll();
    this.clients.set(data);
    this.loading.set(false);
    this.cdr.markForCheck();
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  openCreate(): void {
    this.form.reset();
    this.selectedClient.set(null);
    this.drawerMode.set('create');
    this.drawerOpen.set(true);
  }

  openEdit(client: Client): void {
    this.selectedClient.set(client);
    this.drawerMode.set('edit');
    this.form.patchValue({
      nombre: client.nombre,
      telefono: client.telefono ?? '',
      email: client.email ?? '',
      rfc: client.rfc ?? '',
      notas: client.notas ?? '',
    });
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.form.reset();
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    const raw = this.form.getRawValue();
    const payload = {
      nombre: raw.nombre!.trim(),
      telefono: raw.telefono?.trim() || undefined,
      email: raw.email?.trim() || undefined,
      rfc: raw.rfc?.trim() || undefined,
      notas: raw.notas?.trim() || undefined,
    };

    let result: Client | null = null;
    if (this.drawerMode() === 'create') {
      result = await this.clientService.create(payload);
    } else {
      const id = this.selectedClient()!.id;
      result = await this.clientService.update(id, payload);
    }

    if (result) {
      await this.loadClients();
      this.closeDrawer();
      this.showToast('success', this.drawerMode() === 'create' ? 'Cliente creado' : 'Cliente actualizado');
    } else {
      this.showToast('error', 'Ocurrió un error. Intenta de nuevo.');
    }
    this.saving.set(false);
  }

  confirmDelete(client: Client): void {
    this.deleteTarget.set(client);
  }

  cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  async executeDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    const ok = await this.clientService.delete(target.id);
    if (ok) {
      this.clients.update((list) => list.filter((c) => c.id !== target.id));
      this.showToast('success', 'Cliente eliminado');
    } else {
      this.showToast('error', 'No se pudo eliminar el cliente');
    }
    this.deleteTarget.set(null);
  }

  getInitials(nombre: string): string {
    return nombre
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 3500);
  }
}
