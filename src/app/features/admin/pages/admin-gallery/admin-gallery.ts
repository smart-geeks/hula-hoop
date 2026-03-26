import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { FloatLabelModule } from 'primeng/floatlabel';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { FileUploadModule } from 'primeng/fileupload';
import { ConfirmationService, MessageService } from 'primeng/api';
import { GalleryService } from '../../../../core/services/gallery.service';
import type { GalleryImage } from '../../../../core/interfaces/gallery-image';

@Component({
  selector: 'app-admin-gallery',
  templateUrl: './admin-gallery.html',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    FloatLabelModule,
    TagModule,
    ToggleSwitchModule,
    ConfirmDialogModule,
    ToastModule,
    TooltipModule,
    FileUploadModule,
  ],
  providers: [ConfirmationService, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminGallery {
  private readonly galleryService = inject(GalleryService);
  private readonly fb = inject(FormBuilder);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  readonly images = signal<GalleryImage[]>([]);
  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly dialogVisible = signal(false);
  readonly editingImage = signal<GalleryImage | null>(null);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    title: [''],
    alt_text: [''],
    sort_order: [0],
    is_active: [true],
  });

  constructor() {
    this.loadImages();
  }

  async loadImages(): Promise<void> {
    this.loading.set(true);
    const data = await this.galleryService.getAllImages();
    this.images.set(data);
    this.loading.set(false);
  }

  getImageUrl(image: GalleryImage): string {
    return this.galleryService.getPublicUrl(image.storage_path);
  }

  async onUpload(event: { files: File[] }): Promise<void> {
    this.uploading.set(true);
    let successCount = 0;

    for (const file of event.files) {
      const result = await this.galleryService.uploadImage(file);
      if (result) successCount++;
    }

    if (successCount > 0) {
      this.messageService.add({
        severity: 'success',
        summary: `${successCount} imagen(es) subida(s)`,
      });
      await this.loadImages();
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Error al subir imágenes',
      });
    }

    this.uploading.set(false);
  }

  openEdit(image: GalleryImage): void {
    this.editingImage.set(image);
    this.form.patchValue({
      title: image.title ?? '',
      alt_text: image.alt_text ?? '',
      sort_order: image.sort_order,
      is_active: image.is_active,
    });
    this.dialogVisible.set(true);
  }

  async save(): Promise<void> {
    const editing = this.editingImage();
    if (!editing) return;

    this.saving.set(true);
    const values = this.form.getRawValue();
    const result = await this.galleryService.updateImage(editing.id, values);

    if (result) {
      this.messageService.add({ severity: 'success', summary: 'Imagen actualizada' });
    } else {
      this.messageService.add({ severity: 'error', summary: 'Error al actualizar' });
    }

    this.saving.set(false);
    this.dialogVisible.set(false);
    await this.loadImages();
  }

  async toggleActive(image: GalleryImage): Promise<void> {
    const result = await this.galleryService.updateImage(image.id, {
      is_active: !image.is_active,
    });

    if (result) {
      this.messageService.add({
        severity: 'success',
        summary: image.is_active ? 'Imagen desactivada' : 'Imagen activada',
      });
      await this.loadImages();
    } else {
      this.messageService.add({ severity: 'error', summary: 'Error al actualizar' });
    }
  }

  confirmDelete(image: GalleryImage): void {
    this.confirmationService.confirm({
      message: '¿Eliminar esta imagen? Se eliminará del almacenamiento permanentemente.',
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        const ok = await this.galleryService.deleteImage(image);
        if (ok) {
          this.messageService.add({ severity: 'success', summary: 'Imagen eliminada' });
          await this.loadImages();
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error al eliminar' });
        }
      },
    });
  }
}
