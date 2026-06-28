import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { QuoteService } from '../../../../core/services/quote.service';
import { ContractService } from '../../../../core/services/contract.service';
import { VenueService } from '../../../../core/services/venue.service';
import { PosTicketPrintService } from '../../../../core/services/pos-ticket-print.service';
import { TimeSlotService } from '../../../../core/services/time-slot.service';
import type { Quote, QuoteStatus } from '../../../../core/interfaces/quote';
import type { PaymentSplit } from '../../../../core/interfaces/contract';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
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
    CurrencyMxnPipe,
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
  downloadPdf(quote: Quote): void {
    const win = window.open('', '_blank');
    if (!win) return;

    const fecha = quote.fecha_evento
      ? new Date(quote.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' })
      : '—';
    const itemRows = (quote.items ?? [])
      .map(
        (it) =>
          `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${it.descripcion}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center">${it.cantidad}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right">$${it.precio_unitario.toLocaleString('es-MX')}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">$${(it.cantidad * it.precio_unitario).toLocaleString('es-MX')}</td>
          </tr>`,
      )
      .join('');

    win.document.write(`<!DOCTYPE html><html lang="es"><head>
      <meta charset="UTF-8">
      <title>Cotización ${quote.folio}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;background:#fff;padding:40px}
        .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:3px solid #E30D1C}
        .logo{font-size:28px;font-weight:800;color:#E30D1C}
        .folio{font-size:18px;font-weight:700;color:#475569}
        .meta{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
        .meta-block h4{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:4px}
        .meta-block p{font-size:15px;font-weight:600;color:#1e293b}
        table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px}
        thead tr{background:#f8fafc}
        thead th{padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
        thead th:last-child,thead th:nth-child(3),thead th:nth-child(2){text-align:right}
        thead th:nth-child(2){text-align:center}
        .totals{width:300px;margin-left:auto}
        .totals tr td{padding:6px 12px;font-size:14px}
        .totals tr td:last-child{text-align:right;font-weight:600}
        .totals .total-row td{font-size:16px;font-weight:800;color:#1e293b;border-top:2px solid #e2e8f0;padding-top:12px}
        .deposit-row td{color:#E30D1C;font-size:15px;font-weight:700}
        .balance-row td{color:#64748b}
        .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center}
        @media print{body{padding:20px}}
      </style>
    </head><body>
      <div class="header">
        <div class="logo">Hula Hoop</div>
        <div style="text-align:right">
          <div class="folio">${quote.folio}</div>
          <div style="font-size:13px;color:#64748b;margin-top:4px">Fecha: ${new Date(quote.fecha + 'T12:00:00').toLocaleDateString('es-MX')}</div>
        </div>
      </div>
      <div class="meta">
        <div class="meta-block">
          <h4>Cliente</h4>
          <p>${quote.client?.nombre ?? 'Sin cliente'}</p>
          ${quote.client?.telefono ? `<p style="font-size:13px;color:#64748b;margin-top:2px">${quote.client.telefono}</p>` : ''}
          ${quote.client?.email ? `<p style="font-size:13px;color:#64748b">${quote.client.email}</p>` : ''}
        </div>
        <div class="meta-block">
          <h4>Evento</h4>
          <p>${fecha}</p>
          ${quote.hora_inicio ? `<p style="font-size:13px;color:#64748b;margin-top:2px">${quote.hora_inicio}${quote.hora_fin ? ' – ' + quote.hora_fin : ''}</p>` : ''}
          ${quote.guest_count ? `<p style="font-size:13px;color:#64748b">${quote.guest_count} invitados</p>` : ''}
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Descripción</th><th style="text-align:center">Cant.</th>
          <th style="text-align:right">Precio unit.</th><th style="text-align:right">Subtotal</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table class="totals">
        <tr><td>Subtotal</td><td>$${quote.subtotal.toLocaleString('es-MX')}</td></tr>
        ${quote.descuento > 0 ? `<tr><td>Descuento</td><td>-$${quote.descuento.toLocaleString('es-MX')}</td></tr>` : ''}
        <tr class="total-row"><td>Total</td><td>$${quote.total.toLocaleString('es-MX')}</td></tr>
        ${(quote.deposit_amount ?? 0) > 0 ? `<tr class="deposit-row"><td>Anticipo requerido</td><td>$${(quote.deposit_amount ?? 0).toLocaleString('es-MX')}</td></tr>` : ''}
        ${(quote.deposit_amount ?? 0) > 0 && (quote.total - (quote.deposit_amount ?? 0)) > 0 ? `<tr class="balance-row"><td>Saldo al evento</td><td>$${(quote.total - (quote.deposit_amount ?? 0)).toLocaleString('es-MX')}</td></tr>` : ''}
      </table>
      ${quote.notas ? `<div style="background:#f8fafc;padding:16px;border-radius:8px;margin-top:16px;font-size:13px"><strong>Notas:</strong> ${quote.notas}</div>` : ''}
      ${(() => {
        const cotizacionUrl = `${window.location.origin}/cotizacion/${quote.public_token}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(cotizacionUrl)}`;
        return `<div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
  <p style="font-size:11px;color:#64748b;margin:0 0 4px;">Accede o paga tu anticipo en línea:</p>
  <p style="font-size:12px;font-weight:600;color:#1e293b;word-break:break-all;margin:0 0 8px;">${cotizacionUrl}</p>
  <img src="${qrUrl}" width="120" height="120" alt="QR" style="display:block;margin:0 auto;" />
</div>`;
      })()}
      <div class="footer">Esta cotización fue generada por Hula Hoop · Válida por 15 días</div>
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
