import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { GalleryService } from '../../../../core/services/gallery.service';
import type { GalleryImage } from '../../../../core/interfaces/gallery-image';

@Component({
  selector: 'app-gallery-page',
  templateUrl: './gallery-page.html',
  imports: [RouterLink, DialogModule, ButtonModule, SkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class GalleryPage {
  private readonly galleryService = inject(GalleryService);

  readonly images = signal<GalleryImage[]>([]);
  readonly loading = signal(true);
  readonly lightboxVisible = signal(false);
  readonly selectedIndex = signal(0);

  readonly selectedImage = computed(() => {
    const imgs = this.images();
    const idx = this.selectedIndex();
    return imgs[idx] ?? null;
  });

  readonly hasPrev = computed(() => this.selectedIndex() > 0);
  readonly hasNext = computed(() => this.selectedIndex() < this.images().length - 1);

  constructor() {
    this.loadImages();
  }

  async loadImages(): Promise<void> {
    const data = await this.galleryService.getActiveImages();
    this.images.set(data);
    this.loading.set(false);
  }

  getImageUrl(image: GalleryImage): string {
    return this.galleryService.getPublicUrl(image.storage_path);
  }

  openLightbox(index: number): void {
    this.selectedIndex.set(index);
    this.lightboxVisible.set(true);
  }

  prev(): void {
    if (this.hasPrev()) {
      this.selectedIndex.update((i) => i - 1);
    }
  }

  next(): void {
    if (this.hasNext()) {
      this.selectedIndex.update((i) => i + 1);
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') this.prev();
    if (event.key === 'ArrowRight') this.next();
  }
}
