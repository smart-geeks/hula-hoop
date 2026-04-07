import { ChangeDetectionStrategy, Component, computed, inject, signal, OnInit } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { GalleryService } from '../../../../core/services/gallery.service';
import type { GalleryImage } from '../../../../core/interfaces/gallery-image';

@Component({
  selector: 'app-polaroid-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage],
  templateUrl: './polaroid-section.html',
})
export class PolaroidSection implements OnInit {
  private readonly galleryService = inject(GalleryService);

  readonly images = signal<GalleryImage[]>([]);

  readonly polaroids = computed(() => this.images().slice(0, 3));

  readonly rotations = [-6, 3, -4];

  ngOnInit(): void {
    this.loadImages();
  }

  async loadImages(): Promise<void> {
    const data = await this.galleryService.getActiveImages();
    this.images.set(data);
  }

  getImageUrl(image: GalleryImage): string {
    return this.galleryService.getPublicUrl(image.storage_path);
  }
}
