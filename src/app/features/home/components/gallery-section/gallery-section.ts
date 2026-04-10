import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { GalleryService } from '../../../../core/services/gallery.service';
import type { GalleryImage } from '../../../../core/interfaces/gallery-image';

@Component({
  selector: 'app-gallery-section',
  templateUrl: './gallery-section.html',
  imports: [SkeletonModule, DialogModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GallerySection {
  private readonly galleryService = inject(GalleryService);

  readonly images = signal<GalleryImage[]>([]);
  readonly loading = signal(true);
  readonly selectedIndex = signal(0);
  readonly lightboxVisible = signal(false);

  touchStartX = 0;
  touchEndX = 0;

  readonly selectedImage = computed(() => {
    const imgs = this.images();
    const idx = this.selectedIndex();
    return imgs[idx] ?? null;
  });

  readonly prevImage = computed(() => {
    const imgs = this.images();
    if (imgs.length === 0) return null;
    const len = imgs.length;
    let idx = this.selectedIndex() - 1;
    if (idx < 0) idx = len - 1;
    return imgs[idx] ?? null;
  });

  readonly nextImage = computed(() => {
    const imgs = this.images();
    if (imgs.length === 0) return null;
    const len = imgs.length;
    let idx = this.selectedIndex() + 1;
    if (idx >= len) idx = 0;
    return imgs[idx] ?? null;
  });

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

  prev(): void {
    const len = this.images().length;
    if (len === 0) return;
    this.selectedIndex.update((i) => (i === 0 ? len - 1 : i - 1));
  }

  next(): void {
    const len = this.images().length;
    if (len === 0) return;
    this.selectedIndex.update((i) => (i === len - 1 ? 0 : i + 1));
  }

  openLightbox(): void {
    if (this.images().length > 0) {
      this.lightboxVisible.set(true);
    }
  }

  onLightboxKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') this.prev();
    if (event.key === 'ArrowRight') this.next();
  }

  onTouchStart(e: TouchEvent) {
    this.touchStartX = e.changedTouches[0].screenX;
  }

  onTouchEnd(e: TouchEvent) {
    this.touchEndX = e.changedTouches[0].screenX;
    this.handleSwipe();
  }

  handleSwipe() {
    const swipeThreshold = 50;
    if (this.touchEndX < this.touchStartX - swipeThreshold) {
      this.next(); // swiped left
    }
    if (this.touchEndX > this.touchStartX + swipeThreshold) {
      this.prev(); // swiped right
    }
  }
}
