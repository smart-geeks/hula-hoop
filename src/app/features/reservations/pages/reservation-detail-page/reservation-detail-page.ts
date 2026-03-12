import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { ReservationService } from '../../../../core/services/reservation.service';
import { PaymentService } from '../../../../core/services/payment.service';
import type { PrivateReservation, PlaydateReservation, ReservationStatus } from '../../../../core/interfaces/reservation';

type ReservationType = 'private' | 'playdate' | null;

@Component({
  selector: 'app-reservation-detail-page',
  templateUrl: './reservation-detail-page.html',
  imports: [RouterLink, ButtonModule, TagModule, ToastModule, CurrencyMxnPipe],
  providers: [MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly reservationService = inject(ReservationService);
  private readonly paymentService = inject(PaymentService);
  private readonly messageService = inject(MessageService);

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly reservation = signal<PrivateReservation | PlaydateReservation | null>(null);
  readonly reservationType = signal<ReservationType>(null);
  readonly retryingPayment = signal(false);
  readonly reservationExtras = signal<{ name: string; quantity: number; unit_price_cents: number; pay_at_venue: boolean }[]>([]);

  /** Query param from MP redirect */
  readonly paymentStatus = signal<string | null>(null);

  readonly statusConfig = computed(() => {
    const status = this.reservation()?.status;
    return this.getStatusConfig(status ?? 'pending_payment');
  });

  constructor() {
    this.loadReservation();
  }

  private async loadReservation(): Promise<void> {
    const accessToken = this.route.snapshot.paramMap.get('accessToken');
    if (!accessToken) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    // Check query params from MP redirect
    const queryStatus = this.route.snapshot.queryParamMap.get('status');
    if (queryStatus) {
      this.paymentStatus.set(queryStatus);
    }

    // Try private first, then playdate
    const privateRes = await this.reservationService.getPrivateReservationByToken(accessToken);
    if (privateRes) {
      this.reservation.set(privateRes);
      this.reservationType.set('private');
      const extras = await this.reservationService.getPrivateReservationExtras(privateRes.id);
      this.reservationExtras.set(extras);
      this.loading.set(false);
      return;
    }

    const playdateRes = await this.reservationService.getPlaydateReservationByToken(accessToken);
    if (playdateRes) {
      this.reservation.set(playdateRes);
      this.reservationType.set('playdate');
      this.loading.set(false);
      return;
    }

    this.notFound.set(true);
    this.loading.set(false);
  }

  async retryPayment(): Promise<void> {
    const res = this.reservation();
    const type = this.reservationType();
    if (!res || !type) return;

    this.retryingPayment.set(true);
    const preference = await this.paymentService.createPayment(res.id, type);

    if (preference) {
      this.paymentService.redirectToCheckout(preference);
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo iniciar el proceso de pago.',
      });
    }

    this.retryingPayment.set(false);
  }

  isPrivateReservation(res: PrivateReservation | PlaydateReservation): res is PrivateReservation {
    return 'package_id' in res;
  }

  formatTime(time: string): string {
    const [h, m] = time.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
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
