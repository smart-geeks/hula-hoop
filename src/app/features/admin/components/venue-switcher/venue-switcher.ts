import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { VenueService } from '../../../../core/services/venue.service';

@Component({
  selector: 'app-venue-switcher',
  templateUrl: './venue-switcher.html',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VenueSwitcher {
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  readonly venue = inject(VenueService);
  readonly open = signal(false);

  constructor() {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest('.venue-switcher-root')) {
        this.open.set(false);
      }
    };
    this.doc.addEventListener('click', handler);
    this.destroyRef.onDestroy(() => this.doc.removeEventListener('click', handler));
  }

  toggle(): void {
    this.open.update(v => !v);
  }

  select(venueId: string): void {
    this.venue.switchVenue(venueId);
    this.open.set(false);
  }
}
