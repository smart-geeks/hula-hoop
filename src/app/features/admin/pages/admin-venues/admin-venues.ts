import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { VenueService } from '../../../../core/services/venue.service';
import type { Venue, CreateVenueData } from '../../../../core/interfaces/venue';

type ModalMode = 'create' | 'edit';

@Component({
  selector: 'app-admin-venues',
  templateUrl: './admin-venues.html',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, ToastModule],
  providers: [MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminVenues {
  private readonly fb = inject(FormBuilder);
  readonly venue = inject(VenueService);
  private readonly messageService = inject(MessageService);

  readonly showModal = signal(false);
  readonly modalMode = signal<ModalMode>('create');
  readonly saving = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    nombre:    ['', Validators.required],
    slug:      ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
    direccion: [''],
    telefono:  [''],
    email:     ['', Validators.email],
  });

  openCreate(): void {
    this.form.reset();
    this.editingId.set(null);
    this.modalMode.set('create');
    this.showModal.set(true);
  }

  openEdit(v: Venue): void {
    this.form.reset({
      nombre:    v.nombre,
      slug:      v.slug,
      direccion: v.direccion ?? '',
      telefono:  v.telefono ?? '',
      email:     v.email ?? '',
    });
    this.editingId.set(v.id);
    this.modalMode.set('edit');
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);

    const raw = this.form.getRawValue();
    const data: CreateVenueData = {
      nombre:    raw.nombre,
      slug:      raw.slug,
      direccion: raw.direccion || undefined,
      telefono:  raw.telefono  || undefined,
      email:     raw.email     || undefined,
    };

    const mode = this.modalMode();
    const id   = this.editingId();

    if (mode === 'create') {
      const result = await this.venue.createVenue(data);
      if (result) {
        this.messageService.add({ severity: 'success', summary: 'Salón creado', detail: result.nombre });
        this.showModal.set(false);
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo crear el salón' });
      }
    } else if (id) {
      const result = await this.venue.updateVenue(id, data);
      if (result) {
        this.messageService.add({ severity: 'success', summary: 'Salón actualizado', detail: result.nombre });
        this.showModal.set(false);
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo actualizar el salón' });
      }
    }

    this.saving.set(false);
  }

  async toggleActivo(v: Venue): Promise<void> {
    const result = await this.venue.updateVenue(v.id, { activo: !v.activo });
    if (result) {
      this.messageService.add({
        severity: 'success',
        summary: result.activo ? 'Salón activado' : 'Salón desactivado',
        detail: result.nombre,
      });
    }
  }

  slugFromNombre(): void {
    const nombre = this.form.getRawValue().nombre;
    const slug = nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    this.form.patchValue({ slug });
  }
}
