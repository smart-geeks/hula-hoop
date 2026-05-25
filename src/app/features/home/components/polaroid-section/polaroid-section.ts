import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GalleryService } from '../../../../core/services/gallery.service';
import { PublicVenueService } from '../../../../core/services/public-venue.service';
import type { GalleryImage } from '../../../../core/interfaces/gallery-image';

@Component({
  selector: 'app-polaroid-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './polaroid-section.html',
})
export class PolaroidSection {
  private readonly galleryService = inject(GalleryService);
  private readonly publicVenue   = inject(PublicVenueService);

  readonly images    = signal<GalleryImage[]>([]);
  readonly polaroids = computed(() => this.images().slice(0, 3));
  readonly rotations = [-6, 3, -4];

  constructor() {
    this.loadImages();
  }

  private async loadImages(): Promise<void> {
    const venue = this.publicVenue.activeVenue();
    if (!venue) return;
    const data = await this.galleryService.getActiveImagesByVenue(venue.id);
    this.images.set(data);
  }

  getImageUrl(image: GalleryImage): string {
    return this.galleryService.getPublicUrl(image.storage_path);
  }
}
