import { Injectable, inject } from '@angular/core';
import { VenueService } from './venue.service';
import { PrinterConfigService } from './printer-config.service';
import type { PosSale, CartItem } from '../interfaces/pos';
import type { Contract, ContractPayment } from '../interfaces/contract';
import type { Venue } from '../interfaces/venue';
import type { PrinterConfig } from '../interfaces/printer-config';

const LOGO_URL =
  'https://jzdfxbbnhkzdetrpmqdx.supabase.co/storage/v1/object/public/general/logo.png';

const PAYMENT_LABELS: Record<string, string> = {
  efectivo:      'EFECTIVO',
  tarjeta:       'TARJETA',
  transferencia: 'TRANSFERENCIA',
};

@Injectable({ providedIn: 'root' })
export class PosTicketPrintService {
  private readonly venueService   = inject(VenueService);
  private readonly printerConfig  = inject(PrinterConfigService);

  /** Ticket de venta POS */
  printSale(sale: PosSale, cartItems: CartItem[], cashierName: string | null): void {
    const venue  = this.venueService.currentVenue();
    const config = this.printerConfig.load();
    this.openPrint(this.buildSaleHtml(sale, cartItems, cashierName, venue, config));
  }

  /** Comprobante de pago de contrato */
  printPayment(contract: Contract, payment: ContractPayment): void {
    const venue = this.venueService.currentVenue();
    this.openPrint(this.buildPaymentHtml(contract, payment, venue));
  }

  private openPrint(html: string): void {
    const win = window.open('', '_blank', 'width=400,height=700');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 700);
  }

  // ── Formatters ──────────────────────────────────────────────────────────────

  private fmt(value: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(value);
  }

  private fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  private fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-MX', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  }

  private fmtEventDate(dateStr: string): string {
    // fecha_evento viene como 'YYYY-MM-DD'; forzar UTC para evitar desfase por zona horaria
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('es-MX', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });
  }

  // ── HTML builders ───────────────────────────────────────────────────────────

  private sharedStyles(): string {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: 'Courier New', Courier, monospace;
        font-size: 10.5pt;
        color: #000;
        background: #fff;
        width: 72mm;
        margin: 0 auto;
        padding: 2mm 0;
      }
      .center  { text-align: center; }
      .right   { text-align: right; }
      .bold    { font-weight: bold; }
      .sm      { font-size: 9pt; }
      .xs      { font-size: 8pt; }
      .sep-solid  { border: none; border-top: 1px solid #000; margin: 2mm 0; }
      .sep-dashed { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
      .logo { display: block; max-height: 36px; width: auto; margin: 0 auto 1mm; }
      .venue-name { font-size: 14pt; font-weight: bold; letter-spacing: 0.5px; }
      .venue-sub  { font-size: 8.5pt; }
      .section-title {
        font-size: 9pt; font-weight: bold; text-align: center;
        letter-spacing: 1px; padding: 1mm 0;
      }
      table { width: 100%; border-collapse: collapse; }
      td { vertical-align: top; padding: 0.5mm 0; }
      td.r { text-align: right; white-space: nowrap; }
      .label { font-size: 9pt; }
      .total-row td { font-size: 13pt; font-weight: bold; padding-top: 1mm; }
      .total-row td.r { text-align: right; }
      .footer-msg { text-align: center; font-size: 9.5pt; padding: 1mm 0; }
      @page { size: 80mm auto; margin: 2mm 4mm; }
      @media print { body { width: 72mm; } }
    `;
  }

  private buildHeader(venue: Venue | null, config?: PrinterConfig): string {
    const logoSrc = venue?.logo_url || LOGO_URL;
    const line1   = config?.headerLine1?.trim() || '';
    const line2   = config?.headerLine2?.trim() || '';

    return `
      <div class="center">
        <img src="${logoSrc}" alt="Logo" class="logo" />
        <div class="venue-name">${venue?.nombre ?? 'HULA HOOP'}</div>
        ${venue?.direccion ? `<div class="venue-sub sm">${venue.direccion}</div>` : ''}
        ${venue?.telefono  ? `<div class="venue-sub sm">Tel: ${venue.telefono}</div>` : ''}
        ${line1 ? `<div class="venue-sub sm">${line1}</div>` : ''}
        ${line2 ? `<div class="venue-sub sm">${line2}</div>` : ''}
      </div>
    `;
  }

  private buildSaleHtml(
    sale: PosSale,
    cartItems: CartItem[],
    cashierName: string | null,
    venue: Venue | null,
    config: PrinterConfig,
  ): string {
    const itemRows = cartItems.map(item => {
      const name    = item.nombre.substring(0, 22);
      const qty     = `x${item.cantidad}`;
      const precio  = this.fmt(item.precio_unitario);
      const subtot  = this.fmt(item.subtotal);
      const showSku = item.sku ? `<div class="xs" style="color:#555">${item.sku}</div>` : '';
      return `
        <tr>
          <td><div class="label">${name}</div>${showSku}</td>
          <td class="r sm">${qty}</td>
          <td class="r sm">${precio}</td>
          <td class="r sm bold">${subtot}</td>
        </tr>
      `;
    }).join('');

    const footer = config.footerLine?.trim() || '¡Gracias por tu compra!';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Ticket ${sale.folio}</title>
  <style>${this.sharedStyles()}</style>
</head>
<body>

  ${this.buildHeader(venue, config)}

  <hr class="sep-solid" />
  <div class="section-title">— TICKET DE VENTA —</div>
  <hr class="sep-solid" />

  <table>
    <tr>
      <td class="label xs">Folio</td>
      <td class="r bold">${sale.folio}</td>
    </tr>
    <tr>
      <td class="label xs">Fecha</td>
      <td class="r sm">${this.fmtDate(sale.created_at)} ${this.fmtTime(sale.created_at)}</td>
    </tr>
    ${cashierName ? `
    <tr>
      <td class="label xs">Cajero</td>
      <td class="r sm">${cashierName}</td>
    </tr>` : ''}
  </table>

  <hr class="sep-dashed" />

  <table>
    <thead>
      <tr>
        <td class="xs bold">ARTÍCULO</td>
        <td class="r xs bold">CANT</td>
        <td class="r xs bold">P.U.</td>
        <td class="r xs bold">TOTAL</td>
      </tr>
    </thead>
  </table>
  <hr class="sep-dashed" />
  <table>${itemRows}</table>

  <hr class="sep-solid" />

  <table>
    <tr class="total-row">
      <td class="bold">TOTAL</td>
      <td class="r bold">${this.fmt(sale.total)}</td>
    </tr>
  </table>

  <hr class="sep-dashed" />

  <table>
    <tr>
      <td class="xs">Forma de pago</td>
      <td class="r bold">${PAYMENT_LABELS[sale.pagado_con] ?? sale.pagado_con.toUpperCase()}</td>
    </tr>
  </table>

  <hr class="sep-solid" />

  <div class="footer-msg bold">${footer}</div>

  <div class="center xs" style="margin-top:3mm;color:#555">
    ${venue?.nombre ?? 'Hula Hoop'} &bull; ${new Date().getFullYear()}
  </div>

</body>
</html>`;
  }

  private buildPaymentHtml(
    contract: Contract,
    payment: ContractPayment,
    venue: Venue | null,
  ): string {
    const clientName  = contract.client?.nombre  ?? 'N/D';
    const clientPhone = contract.client?.telefono ?? '';
    const totalPagado = contract.deposito_pagado; // ya incluye el pago recién agregado
    const saldo       = Math.max(0, contract.saldo_pendiente);

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Comprobante ${contract.folio}</title>
  <style>${this.sharedStyles()}</style>
</head>
<body>

  ${this.buildHeader(venue)}

  <hr class="sep-solid" />
  <div class="section-title">— COMPROBANTE DE PAGO —</div>
  <hr class="sep-solid" />

  <table>
    <tr>
      <td class="xs">Contrato</td>
      <td class="r bold">${contract.folio}</td>
    </tr>
    <tr>
      <td class="xs">Fecha pago</td>
      <td class="r sm">${this.fmtDate(payment.fecha)} ${this.fmtTime(payment.created_at)}</td>
    </tr>
  </table>

  <hr class="sep-dashed" />

  <table>
    <tr>
      <td class="xs">Cliente</td>
      <td class="r sm bold">${clientName}</td>
    </tr>
    ${clientPhone ? `
    <tr>
      <td class="xs">Teléfono</td>
      <td class="r sm">${clientPhone}</td>
    </tr>` : ''}
    <tr>
      <td class="xs">Evento</td>
      <td class="r sm">${this.fmtEventDate(contract.fecha_evento)}</td>
    </tr>
  </table>

  <hr class="sep-solid" />

  <table>
    <tr class="total-row">
      <td class="bold">ESTE PAGO</td>
      <td class="r bold">${this.fmt(payment.monto)}</td>
    </tr>
  </table>

  <table style="margin-top:1mm">
    <tr>
      <td class="xs">Forma de pago</td>
      <td class="r bold">${PAYMENT_LABELS[payment.metodo] ?? payment.metodo.toUpperCase()}</td>
    </tr>
  </table>

  <hr class="sep-dashed" />

  <table>
    <tr>
      <td class="sm">Total contrato</td>
      <td class="r sm">${this.fmt(contract.total_contrato)}</td>
    </tr>
    <tr>
      <td class="sm">Total pagado</td>
      <td class="r sm bold">${this.fmt(totalPagado)}</td>
    </tr>
    <tr>
      <td class="sm bold">${saldo > 0 ? 'Saldo pendiente' : '✓ LIQUIDADO'}</td>
      <td class="r sm bold">${saldo > 0 ? this.fmt(saldo) : ''}</td>
    </tr>
  </table>

  ${payment.notas ? `
  <hr class="sep-dashed" />
  <div class="sm" style="padding:1mm 0">Notas: ${payment.notas}</div>` : ''}

  <hr class="sep-solid" />

  <div class="footer-msg bold">¡Gracias por su pago!</div>
  <div class="center xs" style="margin-top:3mm;color:#555">
    ${venue?.nombre ?? 'Hula Hoop'} &bull; ${new Date().getFullYear()}
  </div>

</body>
</html>`;
  }
}
