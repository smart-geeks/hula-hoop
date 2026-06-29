import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { CurrencyPipe, NgClass } from '@angular/common';
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
  imports: [ButtonModule, TagModule, ToastModule, RouterLink, CurrencyPipe, NgClass],
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
  }  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  getPackageTheme(colorName: string | null | undefined) {
    const themes: Record<string, { bg: string; border: string; text: string; lightHex: string; textHex: string; mainHex: string }> = {
      'lima': { bg: 'bg-[#EAFBF1]', border: 'border-[#8CE9AF]', text: 'text-[#046A38]', lightHex: '#EAFBF1', textHex: '#046A38', mainHex: '#8CE9AF' },
      'rosa-pastel': { bg: 'bg-[#FDF4FC]', border: 'border-[#EDB2E4]', text: 'text-[#8A2E76]', lightHex: '#FDF4FC', textHex: '#8A2E76', mainHex: '#EDB2E4' },
      'azul-cielo': { bg: 'bg-[#EBFBFB]', border: 'border-[#85E8E3]', text: 'text-[#006C67]', lightHex: '#EBFBFB', textHex: '#006C67', mainHex: '#85E8E3' },
      'morado': { bg: 'bg-[#F1F1FA]', border: 'border-[#A2A4E0]', text: 'text-[#35378F]', lightHex: '#F1F1FA', textHex: '#35378F', mainHex: '#686ABB' },
      'rojo-brillante': { bg: 'bg-[#FFF5F5]', border: 'border-[#FEE2E2]', text: 'text-[#E30D1C]', lightHex: '#FFF5F5', textHex: '#E30D1C', mainHex: '#E30D1C' },
      'naranja': { bg: 'bg-[#FFF6F2]', border: 'border-[#FED4C2]', text: 'text-[#963604]', lightHex: '#FFF6F2', textHex: '#963604', mainHex: '#FC7632' },
      'marron': { bg: 'bg-[#FAF6F5]', border: 'border-[#E5D3CD]', text: 'text-[#5C3A2E]', lightHex: '#FAF6F5', textHex: '#5C3A2E', mainHex: '#B28B7E' },
      'amarillo-merengue': { bg: 'bg-[#FFFEF2]', border: 'border-[#FBFAC2]', text: 'text-[#787000]', lightHex: '#FFFEF2', textHex: '#787000', mainHex: '#F6F090' },
    };
    return themes[colorName || ''] || themes['rojo-brillante'];
  }

  printPdf(): void {
    const quote = this.quote();
    if (!quote) return;

    const win = window.open('', '_blank');
    if (!win) return;

    const fecha = quote.fecha_evento
      ? new Date(quote.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' })
      : '—';

    const itemRows = (quote.items ?? [])
      .map((it) => {
        let priceStr = `$${it.precio_unitario.toLocaleString('es-MX')}`;
        let subtotalStr = `$${(it.cantidad * it.precio_unitario).toLocaleString('es-MX')}`;
        
        if (it.precio_unitario === 0) {
          if (it.descripcion.toLowerCase().includes('cobro en local') || it.descripcion.toLowerCase().includes('en local')) {
            priceStr = 'Cobro en local';
            subtotalStr = 'Cobro en local';
          } else {
            priceStr = 'Incluido';
            subtotalStr = 'Incluido';
          }
        }
        return `
          <tr>
            <td class="item-desc">${it.descripcion}</td>
            <td class="center">${it.cantidad}</td>
            <td class="num">${priceStr}</td>
            <td class="num" style="font-weight:700;">${subtotalStr}</td>
          </tr>
        `;
      })
      .join('');

    const cotizacionUrl = `${window.location.origin}/cotizacion/${quote.public_token}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(cotizacionUrl)}`;

    win.document.write(`<!DOCTYPE html><html lang="es"><head>
      <meta charset="UTF-8">
      <title>Cotización ${quote.folio} — Hula Hoop</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #1e293b;
          background: #ffffff;
          padding: 40px;
          line-height: 1.4;
          font-size: 13px;
        }
        .container { max-width: 800px; margin: 0 auto; position: relative; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; padding-bottom: 20px; border-bottom: 2px dashed #f1f5f9; }
        .logo-img { height: 55px; width: auto; display: block; }
        .header-right { text-align: right; }
        .badge-folio { background: #FFF5F5; color: #E30D1C; border: 1.5px solid #FEE2E2; padding: 6px 16px; border-radius: 99px; font-weight: 800; font-size: 14px; display: inline-block; letter-spacing: 0.5px; font-family: monospace; }
        .date-label { font-size: 11px; color: #64748b; margin-top: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .info-grid { display: flex; gap: 20px; margin-bottom: 25px; }
        .info-card { flex: 1; background: #fafaf9; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 18px; }
        .info-card-title { font-size: 10px; text-transform: uppercase; font-weight: 800; color: #94a3b8; letter-spacing: 0.08em; margin-bottom: 8px; }
        .info-card p { font-size: 13px; color: #334155; margin-bottom: 3px; }
        .info-card p.name { font-size: 14px; font-weight: 700; color: #1e293b; }
        .info-card p.subtext { color: #64748b; font-size: 12px; }
        .table-container { margin-bottom: 25px; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; }
        table { width: 100%; border-collapse: collapse; }
        thead { background: #f8fafc; }
        th { padding: 10px 14px; text-align: left; font-weight: 700; color: #475569; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0; }
        th.num { text-align: right; }
        th.center { text-align: center; }
        td { padding: 10px 14px; color: #334155; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
        td.num { text-align: right; font-family: monospace; font-weight: 500; }
        td.center { text-align: center; }
        tr:last-child td { border-bottom: none; }
        .item-desc { font-weight: 600; color: #1e293b; }
        
        /* Inclusions Card styling */
        .inclusions-card {
          margin-bottom: 25px;
          border-radius: 20px;
          padding: 16px 20px;
          position: relative;
          overflow: hidden;
          border: 1px solid transparent;
        }
        .inc-mascot-planeta {
          position: absolute;
          right: -15px;
          top: -15px;
          width: 70px;
          height: auto;
          opacity: 0.12;
          pointer-events: none;
        }
        .inc-mascot-rojo {
          position: absolute;
          right: 5px;
          bottom: -5px;
          width: 55px;
          height: auto;
          opacity: 0.15;
          pointer-events: none;
        }
        .inc-title {
          font-size: 13px;
          font-weight: 800;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .inc-list {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px 16px;
          list-style: none;
          position: relative;
          z-index: 2;
        }
        .inclusion-item {
          display: flex;
          align-items: start;
          gap: 6px;
          font-size: 11px;
          color: #334155;
          line-height: 1.3;
        }
        .inclusion-item .emoji {
          font-size: 12px;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .bottom-layout { display: flex; gap: 20px; margin-top: 20px; }
        .booking-card { flex: 1.2; background: linear-gradient(135deg, #FFF5F5 0%, #FFF0F0 100%); border: 1.5px solid #FEE2E2; border-radius: 20px; padding: 18px; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; min-height: 170px; }
        .booking-card-body { position: relative; z-index: 2; max-width: 75%; }
        .booking-title { font-size: 15px; font-weight: 800; color: #E30D1C; margin-bottom: 4px; }
        .booking-desc { font-size: 11px; color: #581c20; line-height: 1.4; margin-bottom: 12px; }
        .mascot-img { position: absolute; right: -5px; bottom: -10px; height: 95px; width: auto; opacity: 0.95; pointer-events: none; z-index: 1; }
        .qr-container { display: flex; align-items: center; gap: 12px; background: #ffffff; padding: 8px 12px; border-radius: 12px; border: 1px solid #fee2e2; margin-top: auto; position: relative; z-index: 2; }
        .qr-img { display: block; width: 54px; height: 54px; border-radius: 4px; }
        .qr-text { font-size: 10px; color: #64748b; line-height: 1.3; }
        .qr-text strong { color: #E30D1C; font-weight: 700; }
        .qr-link { font-size: 9px; color: #94a3b8; word-break: break-all; margin-top: 1px; }
        .summary-card { flex: 1; background: #fafaf9; border: 1px solid #e2e8f0; border-radius: 20px; padding: 16px; display: flex; flex-direction: column; justify-content: center; }
        .summary-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 12px; color: #64748b; }
        .summary-row.total { margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0; color: #1e293b; font-weight: 800; font-size: 14px; }
        .summary-row.deposit { color: #E30D1C; font-weight: 800; font-size: 13px; background: #fff5f5; padding: 5px 8px; border-radius: 6px; margin-top: 6px; }
        .summary-row.balance { font-size: 11px; color: #64748b; margin-top: 6px; padding: 0 8px; }
        .summary-value { font-weight: 600; color: #334155; }
        .summary-row.total .summary-value { font-weight: 800; font-size: 16px; color: #1e293b; }
        .notes-panel { margin-top: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 14px; font-size: 11px; }
        .notes-title { font-weight: 800; color: #475569; margin-bottom: 2px; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; }
        .notes-content { color: #475569; }
        .footer { margin-top: 35px; padding-top: 15px; border-top: 1px solid #f1f5f9; font-size: 10px; color: #94a3b8; text-align: center; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        @media print {
          body { padding: 0; }
          .container { max-width: 100%; }
        }
      </style>
    </head><body>
      <div class="container">
        <div class="header">
          <div class="logo-container">
            <img class="logo-img" src="https://jzdfxbbnhkzdetrpmqdx.supabase.co/storage/v1/object/public/general/logo.png" alt="Hula Hoop" />
          </div>
          <div class="header-right">
            <div class="badge-folio">${quote.folio}</div>
            <div class="date-label">Fecha: ${new Date(quote.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
          </div>
        </div>

        <div class="info-grid">
          <div class="info-card">
            <div class="info-card-title">Cliente</div>
            <p class="name">${quote.client?.nombre ?? 'Sin cliente'}</p>
            ${quote.client?.telefono ? `<p class="subtext">${quote.client.telefono}</p>` : ''}
            ${quote.client?.email ? `<p class="subtext">${quote.client.email}</p>` : ''}
          </div>
          <div class="info-card">
            <div class="info-card-title">Evento</div>
            <p><strong>Fecha:</strong> ${fecha}</p>
            ${quote.hora_inicio ? `<p><strong>Horario:</strong> ${quote.hora_inicio}${quote.hora_fin ? ' – ' + quote.hora_fin : ''}</p>` : ''}
            ${quote.guest_count ? `<p class="subtext"><strong>Invitados:</strong> ${quote.guest_count} personas</p>` : ''}
          </div>
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th class="center" style="width: 80px;">Cant.</th>
                <th class="num" style="width: 120px;">Precio Unit.</th>
                <th class="num" style="width: 120px;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>
        </div>

        ${quote.package?.inclusions && quote.package.inclusions.length > 0 ? (() => {
          const theme = this.getPackageTheme(quote.package.color);
          const listItems = quote.package.inclusions
            .map((inc, i) => {
              const emojis = ['🎈', '🍰', '🍿', '🎉', '🍕', '🥤'];
              const emoji = emojis[i % emojis.length];
              return `<li class="inclusion-item">
                <span class="emoji">${emoji}</span>
                <span class="text">${inc}</span>
              </li>`;
            })
            .join('');
          return `
            <div class="inclusions-card" style="background-color: ${theme.lightHex}; border-color: ${theme.mainHex};">
              <img class="inc-mascot-planeta" src="https://jzdfxbbnhkzdetrpmqdx.supabase.co/storage/v1/object/public/Personajes/planeta.png" alt="Planeta" />
              <img class="inc-mascot-rojo" src="https://jzdfxbbnhkzdetrpmqdx.supabase.co/storage/v1/object/public/Personajes/personaje-h.png" alt="Mascota" />
              <div class="inc-title" style="color: ${theme.textHex};">
                <span>✨</span> Tu paquete ${quote.package.name} incluye:
              </div>
              <ul class="inc-list">
                ${listItems}
              </ul>
            </div>
          `;
        })() : ''}

        <div class="bottom-layout">
          <div class="booking-card">
            <div class="booking-card-body">
              <div class="booking-title">¡Haz realidad su fiesta ideal!</div>
              <div class="booking-desc">Reserva de forma segura realizando el pago de tu anticipo online. ¡Las fechas vuelan!</div>
            </div>
            <img class="mascot-img" src="https://jzdfxbbnhkzdetrpmqdx.supabase.co/storage/v1/object/public/Personajes/astronauta.png" alt="Astronauta" />
            
            <div class="qr-container">
              <img class="qr-img" src="${qrUrl}" alt="QR" />
              <div class="qr-text">
                <strong>Escanea para apartar online</strong>
                <div class="qr-link">${cotizacionUrl}</div>
              </div>
            </div>
          </div>

          <div class="summary-card">
            <div class="summary-row">
              <span>Subtotal</span>
              <span class="summary-value">$${quote.subtotal.toLocaleString('es-MX')} MXN</span>
            </div>
            ${quote.descuento > 0 ? `
            <div class="summary-row">
              <span>Descuento</span>
              <span class="summary-value" style="color: #10b981;">-$${quote.descuento.toLocaleString('es-MX')} MXN</span>
            </div>` : ''}
            <div class="summary-row total">
              <span>Total</span>
              <span class="summary-value">$${quote.total.toLocaleString('es-MX')} MXN</span>
            </div>
            ${(quote.deposit_amount ?? 0) > 0 ? `
            <div class="summary-row deposit">
              <span>Anticipo requerido</span>
              <span class="summary-value" style="color: #E30D1C;">$${(quote.deposit_amount ?? 0).toLocaleString('es-MX')} MXN</span>
            </div>
            <div class="summary-row balance">
              <span>Saldo al evento</span>
              <span class="summary-value">$${(quote.total - (quote.deposit_amount ?? 0)).toLocaleString('es-MX')} MXN</span>
            </div>` : ''}
          </div>
        </div>

        ${quote.notas ? `
        <div class="notes-panel">
          <div class="notes-title">Notas del Evento</div>
          <div class="notes-content">${quote.notas}</div>
        </div>` : ''}

        <div class="footer">
          Esta cotización fue generada por Hula Hoop · Válida por 15 días a partir de su emisión
        </div>
      </div>
    </body></html>`);

    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
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
