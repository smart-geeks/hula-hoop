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
    const raw = this.venue()?.whatsapp || this.venue()?.telefono || FALLBACK_PHONE;
    return `https://wa.me/${toDigits(raw)}`;
  });

  readonly callUrl = computed(() => {
    const raw = this.venue()?.telefono || FALLBACK_PHONE;
    return `tel:+${toDigits(raw)}`;
  });

  readonly phoneDisplay = computed(() => this.venue()?.telefono ?? '871 123 4567');

  readonly address = computed(() => this.venue()?.direccion ?? FALLBACK_ADDRESS);

  readonly mapsUrl = computed(() => {
    const link = this.venue()?.google_maps_link;
    if (link) return link;
    const addr = this.venue()?.direccion;
    return addr
      ? `https://maps.google.com/?q=${encodeURIComponent(addr)}`
      : FALLBACK_MAPS;
  });

  readonly schedules = computed(() => {
    const raw = this.venue()?.horarios;
    if (!raw) {
      return ['Lun – Vie: 4:00 PM – 7:00 PM', 'Sáb – Dom: 9:30 AM – 6:30 PM'];
    }
    // Divide la cadena por salto de línea o barra vertical |
    return raw.split(/[|\n]/).map(line => line.trim()).filter(Boolean);
  });
}
