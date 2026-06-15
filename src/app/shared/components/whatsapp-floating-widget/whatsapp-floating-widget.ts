import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PublicVenueService } from '../../../core/services/public-venue.service';

const FALLBACK_PHONE = '8711234567';

function toDigits(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.startsWith('52') ? d : `52${d}`;
}

@Component({
  selector: 'app-whatsapp-floating-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './whatsapp-floating-widget.html',
})
export class WhatsAppFloatingWidget {
  private readonly publicVenue = inject(PublicVenueService);

  readonly isOpen = signal(false);
  readonly messageText = signal('');

  readonly venue = this.publicVenue.activeVenue;

  readonly phoneDisplay = computed(() => this.venue()?.telefono ?? '871 123 4567');

  toggleOpen(): void {
    this.isOpen.update((v) => !v);
  }

  sendWhatsApp(): void {
    const text = this.messageText().trim();
    if (!text) return;

    const raw = this.venue()?.whatsapp || this.venue()?.telefono || FALLBACK_PHONE;
    const url = `https://wa.me/${toDigits(raw)}?text=${encodeURIComponent(text)}`;
    
    window.open(url, '_blank');
    this.messageText.set('');
    this.isOpen.set(false);
  }
}
