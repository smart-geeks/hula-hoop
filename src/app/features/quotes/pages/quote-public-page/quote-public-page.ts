import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { CurrencyPipe } from '@angular/common';
import { QuoteService } from '../../../../core/services/quote.service';
import { PaymentService } from '../../../../core/services/payment.service';
import { ContractService } from '../../../../core/services/contract.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import type { Quote } from '../../../../core/interfaces/quote';
import type { TimeSlot } from '../../../../core/interfaces/time-slot';

interface AltDate {
  date:   string;
  label:  string;
  slotId: string;
  slot:   Pick<TimeSlot, 'start_time' | 'end_time'>;
}

@Component({
  selector: 'app-quote-public-page',
  templateUrl: './quote-public-page.html',
  imports: [ButtonModule, TagModule, ToastModule, RouterLink, CurrencyPipe],
  providers: [MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuotePublicPage {
  private readonly route           = inject(ActivatedRoute);
  private readonly router          = inject(Router);
  private readonly quoteService    = inject(QuoteService);
  private readonly paymentService  = inject(PaymentService);
  private readonly contractService = inject(ContractService);
  private readonly timeSlotService = inject(TimeSlotService);
  private readonly messageService  = inject(MessageService);
  private readonly platformId      = inject(PLATFORM_ID);

  readonly loading       = signal(true);
  readonly notFound      = signal(false);
  readonly quote         = signal<Quote | null>(null);
  readonly paymentStatus = signal<string | null>(null);
  readonly checkingSlot  = signal(false);
  readonly paying        = signal(false);
  readonly rescheduling  = signal(false);
  readonly slotConflict  = signal<{
    slot:           string;
    availableDates: AltDate[];
  } | null>(null);

  readonly isPaid = computed(() => this.quote()?.estado === 'aprobada');

  readonly quoteItems = computed(() => this.quote()?.items ?? []);

  constructor() {
    this.loadQuote();
  }

  private async loadQuote(): Promise<void> {
    const token  = this.route.snapshot.paramMap.get('token');
    const status = this.route.snapshot.queryParamMap.get('status');
    if (status) this.paymentStatus.set(status);
    if (status === 'approved') void this.launchConfetti();

    if (!token) { this.notFound.set(true); this.loading.set(false); return; }

    const quote = await this.quoteService.getByPublicToken(token);
    if (!quote) { this.notFound.set(true); this.loading.set(false); return; }
    this.quote.set(quote);
    this.loading.set(false);
  }

  async payNow(): Promise<void> {
    const q = this.quote();
    if (!q || this.paying() || this.checkingSlot() || this.isPaid()) return;
    this.checkingSlot.set(true);

    if (q.hora_inicio && q.fecha_evento) {
      const conflict = await this.contractService.checkSlotConflict(
        q.venue_id, q.fecha_evento, q.hora_inicio, q.hora_fin ?? undefined,
      );
      if (conflict) {
        const slots = await this.timeSlotService.getActiveSlotsByVenue(q.venue_id);
        const currentSlot = slots.find(s => s.start_time === q.hora_inicio) ?? null;
        const altDates = currentSlot
          ? await this.buildAltDates(q.venue_id, currentSlot, slots)
          : [];
        this.slotConflict.set({
          slot: `${q.hora_inicio}${q.hora_fin ? ' – ' + q.hora_fin : ''}`,
          availableDates: altDates,
        });
        this.checkingSlot.set(false);
        return;
      }
    }

    this.checkingSlot.set(false);
    this.paying.set(true);
    const pref = await this.paymentService.createPayment(q.id, 'quote');
    if (pref) {
      this.paymentService.redirectToCheckout(pref);
    } else {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo iniciar el pago.' });
      this.paying.set(false);
    }
  }

  async rescheduleAndPay(alt: AltDate): Promise<void> {
    const q = this.quote();
    if (!q || this.rescheduling()) return;
    this.rescheduling.set(true);

    const updated = await this.quoteService.update(q.id, {
      fecha_evento: alt.date,
      hora_inicio:  alt.slot.start_time,
      hora_fin:     alt.slot.end_time,
      time_slot_id: alt.slotId,
    });

    if (!updated) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo reprogramar.' });
      this.rescheduling.set(false);
      return;
    }

    this.quote.set(updated);
    this.slotConflict.set(null);
    this.rescheduling.set(false);
    await this.payNow();
  }

  private async buildAltDates(venueId: string, currentSlot: TimeSlot, allSlots: TimeSlot[]): Promise<AltDate[]> {
    const today  = new Date();
    const toDate = new Date(today.getTime() + 90 * 86400000);
    const from   = today.toISOString().split('T')[0];
    const to     = toDate.toISOString().split('T')[0];

    const booked    = await this.contractService.getBookedDates(venueId, from, to, currentSlot.start_time);
    const bookedSet = new Set(booked.map(b => b.fecha));
    const results: AltDate[] = [];
    const cursor = new Date(today.getTime() + 86400000);

    while (results.length < 6 && cursor <= toDate) {
      const iso     = cursor.toISOString().split('T')[0];
      const dow     = cursor.getDay();
      const dayType: 'weekday' | 'weekend' = (dow === 0 || dow === 6) ? 'weekend' : 'weekday';
      const match   = allSlots.find(s => s.start_time === currentSlot.start_time && s.day_type === dayType)
                   ?? (currentSlot.day_type === dayType ? currentSlot : undefined);
      if (match && !bookedSet.has(iso)) {
        results.push({
          date:   iso,
          label:  cursor.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }),
          slotId: match.id,
          slot:   { start_time: match.start_time, end_time: match.end_time },
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return results;
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  printPdf(): void {
    window.print();
  }

  shareWhatsApp(): void {
    const q = this.quote();
    if (!q) return;
    const url = `${window.location.origin}/cotizacion/${q.public_token}`;
    const text = encodeURIComponent(`Hola, te comparto tu cotización de Hula Hoop: ${url}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  private async launchConfetti(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const confetti = (await import('canvas-confetti')).default;
    confetti({ particleCount: 80, spread: 70, origin: { x: 0.15, y: 0.6 } });
    confetti({ particleCount: 80, spread: 70, origin: { x: 0.85, y: 0.6 } });
    setTimeout(() => confetti({ particleCount: 50, spread: 100, origin: { x: 0.5, y: 0.4 } }), 300);
  }
}
