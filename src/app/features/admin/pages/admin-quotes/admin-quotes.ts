import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { QuoteService } from '../../../../core/services/quote.service';
import { ContractService } from '../../../../core/services/contract.service';
import { VenueService } from '../../../../core/services/venue.service';
import { PosTicketPrintService } from '../../../../core/services/pos-ticket-print.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import type { Quote, QuoteStatus } from '../../../../core/interfaces/quote';
import type { PaymentSplit } from '../../../../core/interfaces/contract';
import { PaymentSplitsInputComponent } from '../../../../shared/components/payment-splits-input/payment-splits-input';

export interface AvailableDate {
  date:    string;
  label:   string;
  dayType: 'weekday' | 'weekend';
  slot:    { start_time: string; end_time: string };
}

const STATUS_CONFIG: Record<QuoteStatus, { label: string; classes: string }> = {
  borrador:  { label: 'Borrador',  classes: 'bg-slate-100 text-slate-600' },
  enviada:   { label: 'Enviada',   classes: 'bg-blue-100 text-blue-700' },
  aprobada:  { label: 'Aprobada',  classes: 'bg-emerald-100 text-emerald-700' },
  rechazada: { label: 'Rechazada', classes: 'bg-red-100 text-red-700' },
  vencida:   { label: 'Vencida',   classes: 'bg-amber-100 text-amber-700' },
};

@Component({
  selector: 'app-admin-quotes',
  templateUrl: './admin-quotes.html',
  imports: [
    FormsModule,
    CurrencyPipe,
    PaymentSplitsInputComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminQuotes {
  private readonly quoteService    = inject(QuoteService);
  private readonly contractService = inject(ContractService);
  private readonly venueService    = inject(VenueService);
  private readonly ticketPrint     = inject(PosTicketPrintService);
  private readonly timeSlotService = inject(TimeSlotService);
  private readonly router          = inject(Router);
  private readonly platformId      = inject(PLATFORM_ID);

  // ── List state ────────────────────────────────────────────
  readonly quotes          = signal<Quote[]>([]);
  /** Maps quote_id → contract.id for approved quotes */
  readonly contractByQuote = signal<Map<string, string>>(new Map());

  // ── Page state ───────────────────────────────────────────
  readonly loading      = signal(true);
  readonly statusFilter = signal<QuoteStatus | 'all'>('all');
  readonly toast        = signal<{ type: 'success' | 'error'; message: string } | null>(null);
  readonly deleteTarget = signal<Quote | null>(null);

  // ── Send popover ─────────────────────────────────────────
  readonly sendTarget  = signal<Quote | null>(null);
  readonly sendMessage = signal('');

  // ── Anticipo dialog (quote → contract) ───────────────────
  readonly anticoDialog  = signal<Quote | null>(null);
  readonly anticoMonto   = signal(0);
  readonly anticoFecha   = signal('');
  readonly anticoSplits  = signal<PaymentSplit[]>([]);
  readonly anticoSaving  = signal(false);

  // ── Slot conflict detection (list view) ───────────────────
  readonly conflictMap              = signal<Map<string, { folio: string; cliente: string }>>(new Map());
  readonly rescheduleDialog         = signal<Quote | null>(null);
  readonly rescheduleAvailableDates = signal<AvailableDate[]>([]);
  readonly rescheduleSaving         = signal(false);
  readonly rescheduleLoadingDates   = signal(false);

  // ── Computed ─────────────────────────────────────────────
  readonly STATUS_CONFIG = STATUS_CONFIG;

  readonly todayStr = computed(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  readonly anticoSplitsValid = computed(() => {
    const splits = this.anticoSplits();
    const total  = this.anticoMonto();
    return splits.length > 0 &&
      splits.every((s) => s.monto > 0) &&
      Math.abs(splits.reduce((acc, s) => acc + s.monto, 0) - total) < 0.01;
  });

  readonly filteredQuotes = computed(() => {
    const f = this.statusFilter();
    return f === 'all' ? this.quotes() : this.quotes().filter((q) => q.estado === f);
  });

  readonly statusOptions: Array<{ value: QuoteStatus | 'all'; label: string }> = [
    { value: 'all',       label: 'Todos' },
    { value: 'borrador',  label: 'Borrador' },
    { value: 'enviada',   label: 'Enviada' },
    { value: 'aprobada',  label: 'Aprobada' },
    { value: 'rechazada', label: 'Rechazada' },
    { value: 'vencida',   label: 'Vencida' },
  ];

  constructor() {
    this.loadAll();
  }

  private async loadAll(): Promise<void> {
    const [quotes, contracts] = await Promise.all([
      this.quoteService.getAll(),
      this.contractService.getAll(),
    ]);
    this.quotes.set(quotes);
    const map = new Map<string, string>();
    for (const c of contracts) { if (c.quote_id) map.set(c.quote_id, c.id); }
    this.contractByQuote.set(map);
    this.loading.set(false);
    void this.checkConflictsForPendingQuotes(quotes);
  }

  // ── Navigation ────────────────────────────────────────────
  openCreate(): void {
    void this.router.navigate(['/admin/cotizaciones/nueva']);
  }

  openEdit(quote: Quote): void {
    void this.router.navigate(['/admin/cotizaciones', quote.id, 'editar']);
  }

  // ── Status actions ────────────────────────────────────────
  async changeStatus(quote: Quote, estado: QuoteStatus): Promise<void> {
    const ok = await this.quoteService.updateStatus(quote.id, estado);
    if (ok) {
      this.quotes.update((list) => list.map((q) => (q.id === quote.id ? { ...q, estado } : q)));
      this.showToast('success', `Estado: ${STATUS_CONFIG[estado].label}`);
    }
  }

  confirmDelete(quote: Quote): void { this.deleteTarget.set(quote); }
  cancelDelete(): void              { this.deleteTarget.set(null); }

  async executeDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    const ok = await this.quoteService.delete(target.id);
    if (ok) {
      this.quotes.update((list) => list.filter((q) => q.id !== target.id));
      this.showToast('success', 'Cotización eliminada');
    } else {
      this.showToast('error', 'No se pudo eliminar');
    }
    this.deleteTarget.set(null);
  }

  // ── Anticipo dialog — convert quote to signed contract ────
  openAnticoDialog(quote: Quote): void {
    this.anticoDialog.set(quote);
    this.anticoMonto.set(quote.deposit_amount ?? quote.total);
    this.anticoFecha.set(this.todayStr());
    this.anticoSplits.set([{ metodo: 'efectivo', monto: quote.deposit_amount ?? this.anticoMonto() }]);
  }

  closeAnticoDialog(): void {
    this.anticoDialog.set(null);
  }

  // ── Reschedule (conflict resolution for admin) ────────────
  openRescheduleDialog(quote: Quote): void {
    this.rescheduleDialog.set(quote);
    this.rescheduleAvailableDates.set([]);
    void this.loadRescheduleOptions(quote);
  }

  closeRescheduleDialog(): void {
    this.rescheduleDialog.set(null);
  }

  async confirmReschedule(alt: AvailableDate): Promise<void> {
    const quote = this.rescheduleDialog();
    if (!quote || this.rescheduleSaving()) return;
    this.rescheduleSaving.set(true);

    const updated = await this.quoteService.update(quote.id, { fecha_evento: alt.date });
    if (updated) {
      this.quotes.update((list) =>
        list.map((q) => (q.id === quote.id ? { ...q, fecha_evento: alt.date } : q)),
      );
      this.conflictMap.update((m) => { const n = new Map(m); n.delete(quote.id); return n; });
      this.closeRescheduleDialog();
      this.showToast('success', `Fecha cambiada a ${alt.label}`);
    } else {
      this.showToast('error', 'No se pudo actualizar la fecha');
    }
    this.rescheduleSaving.set(false);
  }

  private async loadRescheduleOptions(quote: Quote): Promise<void> {
    this.rescheduleLoadingDates.set(true);
    const venueId = this.venueService.currentVenueId();
    if (!venueId || !quote.hora_inicio) {
      this.rescheduleLoadingDates.set(false);
      return;
    }
    const dates = await this.buildAvailableDatesForQuote(venueId, quote.hora_inicio);
    this.rescheduleAvailableDates.set(dates);
    this.rescheduleLoadingDates.set(false);
  }

  private async checkConflictsForPendingQuotes(quotes: Quote[]): Promise<void> {
    const venueId = this.venueService.currentVenueId();
    if (!venueId) return;
    const today = new Date().toISOString().split('T')[0];
    const pending = quotes.filter(
      (q) =>
        (q.estado === 'borrador' || q.estado === 'enviada') &&
        q.fecha_evento != null &&
        q.fecha_evento >= today &&
        q.hora_inicio != null,
    );
    const results = await Promise.all(
      pending.map(async (q) => {
        const hasConflict = await this.contractService.checkSlotConflict(
          venueId, q.fecha_evento!, q.hora_inicio!, q.hora_fin ?? undefined,
        );
        if (!hasConflict) return null;
        const info = await this.contractService.getConflictingContractInfo(
          venueId, q.fecha_evento!, q.hora_inicio!,
        );
        return info ? { quoteId: q.id, info } : null;
      }),
    );
    const map = new Map<string, { folio: string; cliente: string }>();
    for (const r of results) {
      if (r) map.set(r.quoteId, r.info);
    }
    this.conflictMap.set(map);
  }

  private async buildAvailableDatesForQuote(venueId: string, horaInicio: string): Promise<AvailableDate[]> {
    const today  = new Date();
    const toDate = new Date(today.getTime() + 90 * 86400000);
    const from   = today.toISOString().split('T')[0];
    const to     = toDate.toISOString().split('T')[0];

    const [booked, slots] = await Promise.all([
      this.contractService.getBookedDates(venueId, from, to, horaInicio),
      this.timeSlotService.getActiveSlots(),
    ]);

    const bookedSet  = new Set(booked.map((b) => b.fecha));
    const targetSlot = slots.find((s) => s.start_time === horaInicio) ?? slots[0];
    if (!targetSlot) return [];

    const results: AvailableDate[] = [];
    const cursor = new Date(today.getTime() + 86400000);

    while (results.length < 6 && cursor <= toDate) {
      const iso     = cursor.toISOString().split('T')[0];
      const dow     = cursor.getDay();
      const dayType: 'weekday' | 'weekend' = (dow === 0 || dow === 6) ? 'weekend' : 'weekday';

      if (targetSlot.day_type === dayType && !bookedSet.has(iso)) {
        results.push({
          date:    iso,
          label:   cursor.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }),
          dayType,
          slot:    { start_time: targetSlot.start_time, end_time: targetSlot.end_time },
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return results;
  }

  goToEvent(contractId: string): void {
    void this.router.navigate(['/admin/evento', contractId]);
  }

  async submitAnticipo(): Promise<void> {
    const quote = this.anticoDialog();
    if (!quote || this.anticoSaving()) return;

    const monto = this.anticoMonto();
    if (monto <= 0) {
      this.showToast('error', 'El monto debe ser mayor a cero');
      return;
    }

    this.anticoSaving.set(true);

    // Validate slot availability before creating the contract
    if (quote.fecha_evento && quote.hora_inicio) {
      const conflict = await this.contractService.checkSlotConflict(
        quote.venue_id,
        quote.fecha_evento,
        quote.hora_inicio,
        quote.hora_fin ?? undefined,
      );
      if (conflict) {
        const fecha = new Date(quote.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' });
        this.showToast('error', `El slot del ${fecha} (${quote.hora_inicio}) ya tiene un contrato activo. Cambia la fecha de la cotización antes de registrar el anticipo.`);
        this.anticoSaving.set(false);
        return;
      }
    }

    const { data: contract, error } = await this.contractService.create({
      venue_id:        quote.venue_id,
      quote_id:        quote.id,
      client_id:       quote.client_id ?? undefined,
      fecha_evento:    quote.fecha_evento ?? this.todayStr(),
      hora_inicio:     quote.hora_inicio ?? undefined,
      hora_fin:        quote.hora_fin ?? undefined,
      salon_renta:     quote.items?.[0]?.precio_unitario ?? 0,
      total_contrato:  quote.total,
      deposito_pagado: 0,
      estado:          'firmado',
      notas:           quote.notas ?? undefined,
    });

    if (error || !contract) {
      this.showToast('error', `No se pudo crear el contrato: ${error?.message || 'Error desconocido'}`);
      this.anticoSaving.set(false);
      return;
    }

    // Register the payment record
    const splits = this.anticoSplits();
    const metodo = splits.length === 1 ? splits[0].metodo : 'combinado';
    await this.contractService.addPayment(contract.id, {
      monto,
      fecha:          this.anticoFecha(),
      metodo,
      tipo:           'anticipo',
      notas:          `Anticipo — cotización ${quote.folio}`,
      payment_splits: splits,
    });

    // Mark quote as approved
    await this.quoteService.updateStatus(quote.id, 'aprobada');
    this.quotes.update((list) =>
      list.map((q) => (q.id === quote.id ? { ...q, estado: 'aprobada' as QuoteStatus } : q)),
    );

    // Update local map so the event link appears immediately for this quote
    this.contractByQuote.update((m) => new Map(m).set(quote.id, contract.id));

    // Print receipt and navigate to event detail
    const fullContract = await this.contractService.getById(contract.id);
    if (fullContract) {
      const lastPayment = fullContract.payments?.at(-1) ?? null;
      if (lastPayment) {
        this.ticketPrint.printPayment(fullContract, lastPayment, quote);
      }
    }

    this.closeAnticoDialog();
    this.showToast('success', `Contrato ${contract.folio} creado — anticipo registrado`);
    this.anticoSaving.set(false);
    void this.router.navigate(['/admin/evento', contract.id]);
  }

  // ── Send (WhatsApp / Email) ───────────────────────────────
  openSendPanel(quote: Quote): void {
    this.sendTarget.set(quote);
    this.sendMessage.set(this.buildWhatsAppMessage(quote));
  }

  closeSendPanel(): void { this.sendTarget.set(null); }

  sendViaWhatsApp(quote: Quote): void {
    const phone = quote.client?.telefono?.replace(/\D/g, '') ?? '';
    const text = encodeURIComponent(this.sendMessage());
    const url = phone
      ? `https://wa.me/52${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
    void this.markAsSent(quote);
    this.closeSendPanel();
  }

  sendViaEmail(quote: Quote): void {
    const email = quote.client?.email ?? '';
    const subject = encodeURIComponent(`Cotización ${quote.folio} — Hula Hoop`);
    const body = encodeURIComponent(this.buildEmailBody(quote));
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    void this.markAsSent(quote);
    this.closeSendPanel();
  }

  // ── Public link ───────────────────────────────────────────
  getPublicUrl(quote: Quote): string {
    return `${window.location.origin}/cotizacion/${quote.public_token}`;
  }

  copyPublicUrl(quote: Quote): void {
    navigator.clipboard
      .writeText(this.getPublicUrl(quote))
      .then(() => this.showToast('success', 'Link copiado al portapapeles'))
      .catch(() => this.showToast('error', 'No se pudo copiar el link'));
  }

  copyPublicLink(quote: Quote): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const url = `${window.location.origin}/cotizacion/${quote.public_token}`;
    navigator.clipboard.writeText(url).then(() => {
      this.showToast('success', 'Link copiado al portapapeles');
    });
  }

  // ── PDF ───────────────────────────────────────────────────
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

  downloadPdf(quote: Quote): void {
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
              <img class="inc-mascot-rojo" src="https://jzdfxbbnhkzdetrpmqdx.supabase.co/storage/v1/object/public/Personajes/rojo.png" alt="Mascota" />
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

  // ── Helpers ───────────────────────────────────────────────
  setStatusFilter(val: QuoteStatus | 'all'): void { this.statusFilter.set(val); }

  formatDate(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  private async markAsSent(quote: Quote): Promise<void> {
    if (quote.estado === 'borrador') {
      const ok = await this.quoteService.updateStatus(quote.id, 'enviada');
      if (ok) {
        this.quotes.update((list) =>
          list.map((q) => (q.id === quote.id ? { ...q, estado: 'enviada' as QuoteStatus } : q)),
        );
      }
    }
  }

  private buildWhatsAppMessage(quote: Quote): string {
    const client = quote.client?.nombre ?? 'Cliente';
    const fecha = quote.fecha_evento
      ? new Date(quote.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' })
      : '';
    const horario = quote.hora_inicio
      ? `${quote.hora_inicio}${quote.hora_fin ? ' – ' + quote.hora_fin : ''}`
      : '';
    const items = (quote.items ?? [])
      .map((it) => `  • ${it.descripcion} x${it.cantidad} — $${(it.cantidad * it.precio_unitario).toLocaleString('es-MX')}`)
      .join('\n');
    const publicUrl = this.getPublicUrl(quote);

    return [
      `Hola ${client}, te comparto tu cotización *${quote.folio}* de Hula Hoop 🎉`,
      '',
      fecha   ? `📅 Fecha evento: ${fecha}` : '',
      horario ? `⏰ Horario: ${horario}` : '',
      quote.guest_count ? `👥 Invitados: ${quote.guest_count}` : '',
      '',
      '📋 *Conceptos:*',
      items,
      '',
      `Subtotal: $${quote.subtotal.toLocaleString('es-MX')}`,
      quote.descuento > 0 ? `Descuento: -$${quote.descuento.toLocaleString('es-MX')}` : '',
      `*Total: $${quote.total.toLocaleString('es-MX')}*`,
      (quote.deposit_amount ?? 0) > 0 ? `*Anticipo requerido: $${(quote.deposit_amount ?? 0).toLocaleString('es-MX')}*` : '',
      '',
      quote.notas ? `📝 Notas: ${quote.notas}` : '',
      '',
      `🔗 Ver tu cotización en línea: ${publicUrl}`,
      '',
      '¿Tienes alguna pregunta? Estamos para ayudarte. 😊',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildEmailBody(quote: Quote): string {
    const client = quote.client?.nombre ?? 'Cliente';
    const fecha = quote.fecha_evento
      ? new Date(quote.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' })
      : '';
    const items = (quote.items ?? [])
      .map((it) => `• ${it.descripcion} x${it.cantidad}: $${(it.cantidad * it.precio_unitario).toLocaleString('es-MX')}`)
      .join('\n');
    const publicUrl = this.getPublicUrl(quote);

    return [
      `Hola ${client},`,
      '',
      `Adjuntamos tu cotización ${quote.folio}:`,
      '',
      fecha ? `Fecha del evento: ${fecha}` : '',
      quote.hora_inicio ? `Horario: ${quote.hora_inicio} – ${quote.hora_fin ?? ''}` : '',
      quote.guest_count ? `Invitados: ${quote.guest_count}` : '',
      '',
      'CONCEPTOS:',
      items,
      '',
      `Subtotal: $${quote.subtotal.toLocaleString('es-MX')}`,
      quote.descuento > 0 ? `Descuento: -$${quote.descuento.toLocaleString('es-MX')}` : '',
      `Total: $${quote.total.toLocaleString('es-MX')}`,
      (quote.deposit_amount ?? 0) > 0 ? `Anticipo requerido: $${(quote.deposit_amount ?? 0).toLocaleString('es-MX')}` : '',
      '',
      `Ver cotización en línea: ${publicUrl}`,
      '',
      quote.notas ? `Notas: ${quote.notas}` : '',
      '',
      'Gracias por su preferencia,',
      'Equipo Hula Hoop',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 3500);
  }
}
