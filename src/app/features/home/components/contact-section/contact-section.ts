import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { PublicVenueService } from '../../../../core/services/public-venue.service';

const FALLBACK_PHONE   = '8711234567';
const FALLBACK_ADDRESS = 'Edificio Feliciano Chabot #1645';
const FALLBACK_MAPS    = 'https://maps.google.com/?q=Edificio+Feliciano+Chabot+1645,Torreon,Coahuila';

function toDigits(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.startsWith('52') ? d : `52${d}`;
}

@Component({
  selector: 'app-contact-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule],
  templateUrl: './contact-section.html',
})
export class ContactSection {
  private readonly publicVenue = inject(PublicVenueService);

  readonly venue = this.publicVenue.activeVenue;

  readonly whatsappUrl = computed(() => {
    const raw = this.venue()?.telefono ?? FALLBACK_PHONE;
    return `https://wa.me/${toDigits(raw)}`;
  });

  readonly callUrl = computed(() => {
    const raw = this.venue()?.telefono ?? FALLBACK_PHONE;
    return `tel:+${toDigits(raw)}`;
  });

  readonly phoneDisplay = computed(() => this.venue()?.telefono ?? '871 123 4567');

  readonly address = computed(() => this.venue()?.direccion ?? FALLBACK_ADDRESS);

  readonly mapsUrl = computed(() => {
    const addr = this.venue()?.direccion;
    return addr
      ? `https://maps.google.com/?q=${encodeURIComponent(addr)}`
      : FALLBACK_MAPS;
  });
}
