import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ReservationService } from '../../../../core/services/reservation.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import type { PlaydateReservation } from '../../../../core/interfaces/reservation';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

@Component({
  selector: 'app-playdate-confirmation-page',
  templateUrl: './playdate-confirmation-page.html',
  styleUrl: './playdate-confirmation-page.css',
  imports: [DatePipe, CurrencyPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaydateConfirmationPage {
  private readonly route = inject(ActivatedRoute);
  private readonly reservationService = inject(ReservationService);
  private readonly timeSlotService = inject(TimeSlotService);

  readonly reservation = signal<PlaydateReservation | null>(null);
  readonly timeSlot = signal<TimeSlot | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);

  /** Query param ?status=approved|failure|pending from MP redirect */
  readonly mpStatus = signal<string | null>(null);

  constructor() {
    this.loadReservation();
  }

  private async loadReservation(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    const status = this.route.snapshot.queryParamMap.get('status');
    this.mpStatus.set(status);

    const res = await this.reservationService.getPlaydateReservationByToken(token);
    if (!res) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    this.reservation.set(res);

    if (res.time_slot_id) {
      const slot = await this.timeSlotService.getSlotById(res.time_slot_id);
      this.timeSlot.set(slot);
    }

    this.loading.set(false);
  }

  formatTime(time: string): string {
    const [h, m] = time.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  }

  get isConfirmed(): boolean {
    const status = this.reservation()?.status;
    return status === 'confirmed' || status === 'completed';
  }

  get isPending(): boolean {
    const status = this.reservation()?.status;
    return status === 'pending_payment';
  }

  get isCancelled(): boolean {
    const status = this.reservation()?.status;
    return status === 'cancelled';
  }

  get folio(): string {
    const id = this.reservation()?.id ?? '';
    return 'PD-' + id.replace(/-/g, '').slice(0, 8).toUpperCase();
  }

  readonly showCalendarMenu = signal(false);
  readonly pdfLoading = signal(false);

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.calendar-dropdown-container')) {
      this.showCalendarMenu.set(false);
    }
  }

  toggleCalendarMenu(): void {
    this.showCalendarMenu.update(v => !v);
  }

  getFormattedDate(): string {
    const res = this.reservation();
    if (!res) return '';
    try {
      const parts = res.reservation_date.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const localDate = new Date(year, month, day);
        const formatted = new Intl.DateTimeFormat('es-MX', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }).format(localDate);
        return formatted.charAt(0).toUpperCase() + formatted.slice(1);
      }
      return res.reservation_date;
    } catch {
      return res.reservation_date;
    }
  }

  private getEventDateTime(isEnd: boolean = false): Date {
    const res = this.reservation();
    const slot = this.timeSlot();
    if (!res) return new Date();

    const dateParts = res.reservation_date.split('-');
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);

    let hour = 9;
    let min = 0;

    if (slot) {
      const timeStr = isEnd ? slot.end_time : slot.start_time;
      const timeParts = timeStr.split(':');
      hour = parseInt(timeParts[0], 10);
      min = parseInt(timeParts[1], 10);
    }

    return new Date(year, month, day, hour, min);
  }

  shareWhatsApp(): void {
    const res = this.reservation();
    if (!res) return;

    const dateFormatted = this.getFormattedDate();
    const timeFormatted = this.timeSlot()
      ? `${this.formatTime(this.timeSlot()!.start_time)} a ${this.formatTime(this.timeSlot()!.end_time)}`
      : '';

    const text = `¡Hola! Te comparto la confirmación de mi reserva en *Hula Hoop Park* 🦘✨\n\n*Folio:* ${this.folio}\n*Nombre:* ${res.guest_name}\n*Fecha:* ${dateFormatted}\n*Horario:* ${timeFormatted}\n*Niños:* ${res.kids_count}\n*Adultos:* ${res.adults_count}\n\nPuedes ver el boleto digital aquí:\n${window.location.origin}/reserva/${res.access_token}`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  addToGoogleCalendar(): void {
    const res = this.reservation();
    if (!res) return;

    const startDate = this.getEventDateTime(false);
    const endDate = this.getEventDateTime(true);

    const pad = (n: number) => n.toString().padStart(2, '0');
    const formatDateForGoogle = (date: Date) => {
      return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
    };

    const startStr = formatDateForGoogle(startDate);
    const endStr = formatDateForGoogle(endDate);
    const text = encodeURIComponent('Play Day - Hula Hoop Park');
    const details = encodeURIComponent(
      `Confirmación de Reserva\n` +
      `Folio: ${this.folio}\n` +
      `Nombre: ${res.guest_name}\n` +
      `Importante: Llevar calcetines antiderrapantes.\n` +
      `Boleto digital: ${window.location.origin}/reserva/${res.access_token}`
    );
    const location = encodeURIComponent('Hula Hoop Park');
    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${startStr}/${endStr}&details=${details}&location=${location}`;

    window.open(googleUrl, '_blank');
  }

  downloadIcs(): void {
    const res = this.reservation();
    if (!res) return;

    const startDate = this.getEventDateTime(false);
    const endDate = this.getEventDateTime(true);

    const pad = (n: number) => n.toString().padStart(2, '0');
    const formatDateForIcs = (date: Date) => {
      return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
    };

    const startStr = formatDateForIcs(startDate);
    const endStr = formatDateForIcs(endDate);

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Hula Hoop//Playdate Reservation//EN',
      'BEGIN:VEVENT',
      `UID:${res.id}@hulahoop.park`,
      `DTSTAMP:${formatDateForIcs(new Date())}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      'SUMMARY:Play Day - Hula Hoop Park',
      `DESCRIPTION:Reserva de Play Day\\nFolio: ${this.folio}\\nNombre: ${res.guest_name}\\nImportante: Llevar calcetines antiderrapantes.\\nBoleto digital: ${window.location.origin}/reserva/${res.access_token}`,
      'LOCATION:Hula Hoop Park',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reserva-${this.folio}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  async exportPDF(): Promise<void> {
    const res = this.reservation();
    if (!res) return;

    const element = document.querySelector('article') as HTMLElement;
    if (!element) return;

    this.pdfLoading.set(true);

    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgWidth = 110;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      const x = (210 - imgWidth) / 2;
      const y = (297 - imgHeight) / 2;

      pdf.addImage(imgData, 'PNG', x, y > 15 ? y : 15, imgWidth, imgHeight);
      pdf.save(`boleto-${this.folio}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
    } finally {
      this.pdfLoading.set(false);
    }
  }
}
