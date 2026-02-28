import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';

@Component({
  selector: 'app-private-events-section',
  imports: [ButtonModule, ChipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './private-events-section.html',
})
export class PrivateEventsSection {
  readonly inclusions = [
    { label: 'Merienda', icon: 'pi pi-gift' },
    { label: 'Bebida Refill', icon: 'pi pi-sync' },
    { label: 'Host', icon: 'pi pi-user' },
    { label: 'Actividades', icon: 'pi pi-star' },
    { label: 'Vajilla', icon: 'pi pi-palette' },
    { label: 'Piñata', icon: 'pi pi-heart' },
    { label: '3 Horas de Evento', icon: 'pi pi-clock' },
    { label: 'Asistentes Playground', icon: 'pi pi-users' },
  ];

  onReservar(): void {
    console.log('Reservar Fiesta clicked');
  }
}
