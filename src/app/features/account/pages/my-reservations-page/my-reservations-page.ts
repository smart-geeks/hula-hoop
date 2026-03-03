import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TabsModule } from 'primeng/tabs';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { ReservationService } from '../../../../core/services/reservation.service';
import { AuthService } from '../../../../core/services/auth.service';
import type { PrivateReservation, PlaydateReservation, ReservationStatus } from '../../../../core/interfaces/reservation';

@Component({
  selector: 'app-my-reservations-page',
  templateUrl: './my-reservations-page.html',
  imports: [RouterLink, ButtonModule, TagModule, TabsModule, CurrencyMxnPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyReservationsPage {
  private readonly reservationService = inject(ReservationService);
  private readonly authService = inject(AuthService);

  readonly loading = signal(true);
  readonly privateReservations = signal<PrivateReservation[]>([]);
  readonly playdateReservations = signal<PlaydateReservation[]>([]);
  readonly activeTab = signal('0');

  readonly hasReservations = computed(() => {
    return this.privateReservations().length > 0 || this.playdateReservations().length > 0;
  });

  constructor() {
    this.loadReservations();
  }

  private async loadReservations(): Promise<void> {
    this.loading.set(true);
    const user = this.authService.currentUser();
    if (!user) {
      this.loading.set(false);
      return;
    }

    const [privateRes, playdateRes] = await Promise.all([
      this.reservationService.getPrivateReservationsByProfile(user.id),
      this.reservationService.getPlaydateReservationsByProfile(user.id),
    ]);

    this.privateReservations.set(privateRes);
    this.playdateReservations.set(playdateRes);
    this.loading.set(false);
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('es-MX', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  getStatusConfig(status: ReservationStatus): { label: string; severity: string } {
    switch (status) {
      case 'pending_payment':
        return { label: 'Pendiente de pago', severity: 'warn' };
      case 'confirmed':
        return { label: 'Confirmada', severity: 'success' };
      case 'completed':
        return { label: 'Completada', severity: 'info' };
      case 'cancelled':
        return { label: 'Cancelada', severity: 'danger' };
      case 'expired':
        return { label: 'Expirada', severity: 'secondary' };
      default:
        return { label: status, severity: 'info' };
    }
  }
}
