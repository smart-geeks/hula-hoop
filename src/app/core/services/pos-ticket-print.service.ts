import { Injectable, inject } from '@angular/core';
import { VenueService } from './venue.service';
import { PrinterConfigService } from './printer-config.service';
import { EscPosBuilder } from '../utils/esc-pos-builder';
import type { PosSale, CartItem } from '../interfaces/pos';
import type { Contract, ContractPayment } from '../interfaces/contract';
import type { Venue } from '../interfaces/venue';
import type { PrinterConfig } from '../interfaces/printer-config';
import type { Quote, QuoteItem } from '../interfaces/quote';

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

  private cachedLogoData: ImageData | null = null;
  private cachedLogoUrl: string | null = null;
  private cachedPaperSize: '58mm' | '80mm' | null = null;

  constructor() {
    // Initial background preload of the logo image
    setTimeout(() => {
      try {
        const venue = this.venueService.currentVenue();
        const config = this.printerConfig.load();
        const logoUrl = venue?.logo_url || LOGO_URL;
        this.preloadLogo(logoUrl, config.paperSize);
      } catch (e) {
        console.warn('[PrintService] Failed to run initial logo preload:', e);
      }
    }, 500);
  }

  private async preloadLogo(url: string, paperSize: '58mm' | '80mm'): Promise<void> {
    this.cachedLogoUrl = url;
    this.cachedPaperSize = paperSize;
    try {
      const imgData = await this.getLogoImageData(url, paperSize);
      this.cachedLogoData = imgData;
      console.log('[PrintService] Logo preloaded into cache successfully:', imgData ? 'ImageData OK' : 'NULL');
    } catch (err) {
      console.error('[PrintService] Failed to preload logo:', err);
    }
  }

  /** Ticket de venta POS */
  printSale(sale: PosSale, cartItems: CartItem[], cashierName: string | null): void {
    console.log('[PrintService] printSale iniciado para el folio:', sale?.folio);
    try {
      const venue  = this.venueService.currentVenue();
      const config = this.printerConfig.load();
      const html   = this.buildSaleHtml(sale, cartItems, cashierName, venue, config);

      console.log('[PrintService] Configuración de impresora cargada:', config);

      if (config.connectionType === 'ip' && config.ipAddress?.trim()) {
        const logoUrl = venue?.logo_url || LOGO_URL;
        console.log('[PrintService] Conexión IP activa. Logo URL:', logoUrl);
        
        if (this.cachedLogoUrl !== logoUrl || this.cachedPaperSize !== config.paperSize) {
          console.log('[PrintService] URL o tamaño de papel cambió. Iniciando precarga de logo...');
          this.preloadLogo(logoUrl, config.paperSize);
        }
        
        console.log('[PrintService] Generando bytes ESC/POS. Logo precargado disponible:', !!this.cachedLogoData);
        const bytes = this.buildSaleEscPos(sale, cartItems, cashierName, venue, config, this.cachedLogoData);
        
        console.log('[PrintService] Bytes ESC/POS generados exitosamente. Longitud:', bytes?.length);
        this.printDirect(bytes, html, config);
      } else {
        console.log('[PrintService] Conexión no es IP. Abriendo asistente de impresión del navegador...');
        this.openPrint(html);
      }
    } catch (error) {
      console.error('[PrintService] Error crítico detectado en printSale:', error);
      // Fallback síncrono absoluto de emergencia
      try {
        const venue  = this.venueService.currentVenue();
        const config = this.printerConfig.load();
        const html   = this.buildSaleHtml(sale, cartItems, cashierName, venue, config);
        this.openPrint(html);
      } catch (err2) {
        console.error('[PrintService] Fallback de emergencia falló:', err2);
      }
    }
  }

  /** Comprobante de pago de contrato */
  printPayment(contract: Contract, payment: ContractPayment, quote?: Quote | null): void {
    console.log('[PrintService] printPayment iniciado para el contrato:', contract?.id);
    try {
      const venue  = this.venueService.currentVenue();
      const config = this.printerConfig.load();
      const html   = this.buildPaymentHtml(contract, payment, venue, quote);

      console.log('[PrintService] Configuración de impresora cargada:', config);

      if (config.connectionType === 'ip' && config.ipAddress?.trim()) {
        const logoUrl = venue?.logo_url || LOGO_URL;
        console.log('[PrintService] Conexión IP activa. Logo URL:', logoUrl);
        
        if (this.cachedLogoUrl !== logoUrl || this.cachedPaperSize !== config.paperSize) {
          console.log('[PrintService] URL o tamaño de papel cambió. Iniciando precarga de logo...');
          this.preloadLogo(logoUrl, config.paperSize);
        }
        
        console.log('[PrintService] Generando bytes ESC/POS. Logo precargado disponible:', !!this.cachedLogoData);
        const bytes = this.buildPaymentEscPos(contract, payment, venue, config, this.cachedLogoData, quote);
        
        console.log('[PrintService] Bytes ESC/POS generados exitosamente. Longitud:', bytes?.length);
        this.printDirect(bytes, html, config);
      } else {
        console.log('[PrintService] Conexión no es IP. Abriendo asistente de impresión del navegador...');
        this.openPrint(html);
      }
    } catch (error) {
      console.error('[PrintService] Error crítico detectado en printPayment:', error);
      // Fallback síncrono de emergencia
      try {
        const venue  = this.venueService.currentVenue();
        const html   = this.buildPaymentHtml(contract, payment, venue, quote);
        this.openPrint(html);
      } catch (err2) {
        console.error('[PrintService] Fallback de emergencia falló:', err2);
      }
    }
  }

  private openPrint(html: string): void {
    const win = window.open('', '_blank', 'width=400,height=700');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 700);
  }

  private async printDirect(
    bytes: Uint8Array,
    fallbackHtml: string,
    config: PrinterConfig
  ): Promise<boolean> {
    const bridgeHost = config.bridgeAddress?.trim() || 'localhost';
    let wsUrl = '';
    if (bridgeHost.startsWith('ws://') || bridgeHost.startsWith('wss://')) {
      wsUrl = bridgeHost;
    } else if (bridgeHost === 'localhost' || bridgeHost === '127.0.0.1') {
      wsUrl = `ws://${bridgeHost}:9101`;
    } else {
      // Use secure WSS for remote hosts via Nginx reverse proxy subpath to prevent HTTPS Mixed Content blocks
      wsUrl = `wss://${bridgeHost}/print-bridge`;
    }
    return new Promise<boolean>((resolve) => {
      let resolved = false;

      // Repeat the raw bytes according to copiesPerSale setting
      const copies = Math.max(1, config.copiesPerSale || 1);
      let bytesToPrint = bytes;
      if (copies > 1) {
        console.log(`[PrintService] Repeating print job for ${copies} copies.`);
        const totalLen = bytes.length * copies;
        const combined = new Uint8Array(totalLen);
        for (let i = 0; i < copies; i++) {
          combined.set(bytes, i * bytes.length);
        }
        bytesToPrint = combined;
      }

      // Base64 encoding of bytes
      const base64Payload = btoa(
        Array.from(bytesToPrint)
          .map((b) => String.fromCharCode(b))
          .join('')
      );

      console.log('[PrintService] Connecting to local print bridge at', wsUrl);
      const ws = new WebSocket(wsUrl);

      // Set timeout of 3 seconds
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('[PrintService] Print bridge connection timed out. Falling back to browser print.');
          ws.close();
          this.openPrint(fallbackHtml);
          resolve(false);
        }
      }, 3000);

      ws.onopen = () => {
        console.log('[PrintService] Connected to print bridge. Sending job...');
        ws.send(
          JSON.stringify({
            type: 'print',
            ip: config.ipAddress,
            port: config.ipPort || 9100,
            payload: base64Payload,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          if (response.status === 'success') {
            console.log('[PrintService] Direct print job completed successfully.');
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              ws.close();
              resolve(true);
            }
          } else {
            console.error('[PrintService] Print bridge returned error:', response.message);
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              ws.close();
              this.openPrint(fallbackHtml);
              resolve(false);
            }
          }
        } catch (err) {
          console.error('[PrintService] Error parsing bridge response:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[PrintService] WebSocket error connecting to bridge:', err);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          ws.close();
          this.openPrint(fallbackHtml);
          resolve(false);
        }
      };

      ws.onclose = () => {
        console.log('[PrintService] Print bridge connection closed.');
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          this.openPrint(fallbackHtml);
          resolve(false);
        }
      };
    });
  }

  private buildSaleEscPos(
    sale: PosSale,
    cartItems: CartItem[],
    cashierName: string | null,
    venue: Venue | null,
    config: PrinterConfig,
    logoImgData: ImageData | null = null,
  ): Uint8Array {
    const builder = new EscPosBuilder(config.paperSize);
    
    // Header Logo (Dynamic Raster Image)
    if (logoImgData) {
      builder.alignCenter().rasterImage(logoImgData).feed(1);
    }
    
    // Header
    builder.alignCenter().bold(true).doubleSize(true);
    builder.textLine(venue?.nombre ?? 'HULA HOOP');
    builder.doubleSize(false).bold(false);
    
    if (venue?.direccion) {
      builder.textLine(venue.direccion);
    }
    if (venue?.telefono) {
      builder.textLine(`Tel: ${venue.telefono}`);
    }
    
    const line1 = config.headerLine1?.trim();
    const line2 = config.headerLine2?.trim();
    if (line1) builder.textLine(line1);
    if (line2) builder.textLine(line2);
    
    builder.solidLine();
    builder.bold(true).textLine('— TICKET DE VENTA —').bold(false);
    builder.solidLine();
    
    builder.alignLeft();
    builder.row('Folio:', sale.folio);
    builder.row('Fecha:', `${this.fmtDate(sale.created_at)} ${this.fmtTime(sale.created_at)}`);
    if (cashierName) {
      builder.row('Cajero:', cashierName);
    }
    
    builder.dashedLine();
    
    // Table Headers
    if (config.paperSize === '80mm') {
      builder.bold(true).textLine(
        'ARTICULO'.padEnd(22) + 
        'CANT'.padStart(6) + 
        'P.U.'.padStart(9) + 
        'TOTAL'.padStart(11)
      ).bold(false);
    } else {
      builder.bold(true).textLine(
        'ARTICULO'.padEnd(16) + 
        'CANT x P.U.'.padStart(16)
      ).bold(false);
    }
    
    builder.dashedLine();
    
    // Item Rows
    for (const item of cartItems) {
      const name = item.nombre;
      const qty = `x${item.cantidad}`;
      const price = this.fmt(item.precio_unitario);
      const subtotal = this.fmt(item.subtotal);
      
      builder.saleItemRow(name, qty, price, subtotal);
      if (item.sku) {
        builder.textLine(`  SKU: ${item.sku}`);
      }
    }
    
    builder.solidLine();
    
    // Total Row
    builder.alignRight().bold(true);
    builder.textLine(`TOTAL: ${this.fmt(sale.total)}`);
    builder.bold(false).alignLeft();
    
    builder.dashedLine();
    
    // Payment Method
    const label = PAYMENT_LABELS[sale.pagado_con] ?? sale.pagado_con.toUpperCase();
    builder.row('Forma de pago:', label);
    
    builder.solidLine();
    
    // Footer
    const footer = config.footerLine?.trim() || '¡Gracias por tu compra!';
    builder.alignCenter().bold(true).textLine(footer).bold(false);
    
    // Copyright
    builder.feed(1);
    builder.textLine(`${venue?.nombre ?? 'Hula Hoop'} • ${new Date().getFullYear()}`);
    
    // Drawer Kick: Only if cash payment is used
    if (sale.pagado_con === 'efectivo') {
      builder.kickDrawer();
    }
    
    // Feed and Cut
    builder.feed(4);
    builder.cut();
    
    return builder.build();
  }

  private buildPaymentEscPos(
    contract: Contract,
    payment: ContractPayment,
    venue: Venue | null,
    config: PrinterConfig,
    logoImgData: ImageData | null = null,
    quote?: Quote | null,
  ): Uint8Array {
    const builder = new EscPosBuilder(config.paperSize);
    
    // Header Logo (Dynamic Raster Image)
    if (logoImgData) {
      builder.alignCenter().rasterImage(logoImgData).feed(1);
    }
    
    // Header
    builder.alignCenter().bold(true).doubleSize(true);
    builder.textLine(venue?.nombre ?? 'HULA HOOP');
    builder.doubleSize(false).bold(false);
    
    if (venue?.direccion) {
      builder.textLine(venue.direccion);
    }
    if (venue?.telefono) {
      builder.textLine(`Tel: ${venue.telefono}`);
    }
    
    const line1 = config.headerLine1?.trim();
    const line2 = config.headerLine2?.trim();
    if (line1) builder.textLine(line1);
    if (line2) builder.textLine(line2);
    
    builder.solidLine();
    builder.bold(true).textLine('— COMPROBANTE DE PAGO —').bold(false);
    builder.solidLine();
    
    builder.alignLeft();
    builder.row('Contrato:', contract.folio);
    if (quote?.folio) {
      builder.row('Cotización:', quote.folio);
    }
    builder.row('Fecha pago:', `${this.fmtDate(payment.fecha)} ${this.fmtTime(payment.created_at)}`);
    
    builder.dashedLine();
    
    const clientName  = contract.client?.nombre  ?? 'N/D';
    const clientPhone = contract.client?.telefono ?? '';
    builder.row('Cliente:', clientName);
    if (clientPhone) {
      builder.row('Telefono:', clientPhone);
    }
    
    builder.solidLine();
    builder.alignCenter().bold(true).textLine('DATOS DEL EVENTO').bold(false).alignLeft();
    builder.dashedLine();
    
    builder.row('Fecha Evento:', this.fmtEventDate(contract.fecha_evento));
    if (contract.hora_inicio) {
      builder.row('Horario:', `${this.fmtHourSlot(contract.hora_inicio)} a ${this.fmtHourSlot(contract.hora_fin)}`);
    }
    if (quote?.guest_count) {
      builder.row('Invitados:', `${quote.guest_count}`);
    }
    
    // Package and Snack details
    let packageName = 'No especificado';
    let snackName = 'No especificada';
    const extras: QuoteItem[] = [];

    if (quote?.items) {
      for (const item of quote.items) {
        if (item.descripcion.startsWith('Merienda:')) {
          snackName = item.descripcion.replace('Merienda:', '').trim();
        } else if (packageName === 'No especificado') {
          packageName = item.descripcion;
        } else {
          extras.push(item);
        }
      }
    }

    builder.dashedLine();
    builder.row('Paquete:', packageName);
    builder.row('Merienda:', snackName);
    
    if (extras.length > 0) {
      builder.dashedLine();
      builder.bold(true).textLine('EXTRAS CONTRATADOS:').bold(false);
      for (const extra of extras) {
        builder.saleItemRow(
          extra.descripcion,
          `x${extra.cantidad}`,
          this.fmt(extra.precio_unitario),
          this.fmt(extra.cantidad * extra.precio_unitario)
        );
      }
    }
    
    builder.solidLine();
    
    // Este Pago Row
    builder.alignRight().bold(true);
    builder.textLine(`ESTE PAGO: ${this.fmt(payment.monto)}`);
    builder.bold(false).alignLeft();
    
    const label = PAYMENT_LABELS[payment.metodo] ?? payment.metodo.toUpperCase();
    builder.row('Forma de pago:', label);
    
    builder.dashedLine();
    
    const totalPagado = contract.deposito_pagado;
    const saldo       = Math.max(0, contract.saldo_pendiente);
    
    builder.row('Total contrato:', this.fmt(contract.total_contrato));
    if (quote?.deposit_amount) {
      builder.row('Anticipo Req.:', this.fmt(quote.deposit_amount));
    }
    builder.row('Total pagado:', this.fmt(totalPagado));
    
    const saldoLabel = saldo > 0 ? 'Saldo pendiente:' : '✓ LIQUIDADO';
    const saldoValue = saldo > 0 ? this.fmt(saldo) : '';
    builder.bold(true).row(saldoLabel, saldoValue).bold(false);
    
    if (saldo > 0) {
      builder.row('Fecha Lím. Pago:', this.getPaymentDeadline(contract.fecha_evento));
    }
    
    if (payment.notas) {
      builder.dashedLine();
      builder.textLine(`Notas Pago: ${payment.notas}`);
    }
    
    if (contract.notas) {
      builder.dashedLine();
      builder.textLine(`Notas Contrato: ${contract.notas}`);
    }
    
    builder.solidLine();
    
    // Footer
    builder.alignCenter().bold(true).textLine('¡Gracias por su confianza!').bold(false);
    
    // Copyright
    builder.feed(1);
    builder.textLine(`${venue?.nombre ?? 'Hula Hoop'} • ${new Date().getFullYear()}`);
    
    // Drawer Kick: Only if cash payment is used
    if (payment.metodo === 'efectivo') {
      builder.kickDrawer();
    }
    
    // Feed and Cut
    builder.feed(4);
    builder.cut();
    
    return builder.build();
  }

  /**
   * Loads an image from a URL, resizes it using an offscreen canvas to fit the 
   * receipt printable width, and returns its HTML5 ImageData representation.
   */
  private async getLogoImageData(url: string, paperSize: '58mm' | '80mm'): Promise<ImageData | null> {
    return new Promise((resolve) => {
      let resolved = false;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      // Strict 1.5 second safety timeout to prevent printer queue hang
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('[PrintService] Logo image loading timed out (1.5s). Printing receipt as text-only.');
          resolve(null);
        }
      }, 1500);

      img.onload = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        try {
          const canvas = document.createElement('canvas');
          
          // Target width: 320px for 80mm, 240px for 58mm (prominent, beautiful size)
          const targetWidth = paperSize === '80mm' ? 320 : 240;
          const scale = targetWidth / img.width;
          const targetHeight = Math.round(img.height * scale);
          
          // ESC/POS raster width must be a multiple of 8
          const finalWidth = Math.ceil(targetWidth / 8) * 8;
          canvas.width = finalWidth;
          canvas.height = targetHeight;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          
          // Draw white background
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, finalWidth, targetHeight);
          
          // Center the scaled image in the padded canvas area
          const dx = (finalWidth - (img.width * scale)) / 2;
          ctx.drawImage(img, dx, 0, img.width * scale, targetHeight);
          
          const imgData = ctx.getImageData(0, 0, finalWidth, targetHeight);
          resolve(imgData);
        } catch (e) {
          console.error('[PrintService] Error converting logo to monochrome raster:', e);
          resolve(null);
        }
      };
      
      img.onerror = (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        console.warn('[PrintService] Failed to load logo from URL. Printing receipt as text-only.', err);
        resolve(null);
      };
      
      // Always set source AFTER setting onload/onerror to avoid cached load race conditions
      img.src = url;
    });
  }

  // ── Formatters ──────────────────────────────────────────────────────────────

  private fmt(value: any): string {
    const num = typeof value === 'number' ? value : parseFloat(value || '0');
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(isNaN(num) ? 0 : num);
  }

  private fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleDateString('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    } catch {
      return String(iso);
    }
  }

  private fmtTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('es-MX', {
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
    } catch {
      return '';
    }
  }

  private fmtEventDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    try {
      const parts = dateStr.split('-');
      if (parts.length < 3) return String(dateStr);
      const [y, m, d] = parts.map(Number);
      const date = new Date(y, m - 1, d);
      return date.toLocaleDateString('es-MX', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      });
    } catch {
      return String(dateStr);
    }
  }

  private getPaymentDeadline(eventDateStr: string | null | undefined): string {
    if (!eventDateStr) return '—';
    try {
      const parts = eventDateStr.split('-');
      if (parts.length < 3) return String(eventDateStr);
      const [y, m, d] = parts.map(Number);
      const date = new Date(y, m - 1, d);
      date.setDate(date.getDate() - 15);
      return date.toLocaleDateString('es-MX', {
        day: '2-digit', month: 'long', year: 'numeric',
      });
    } catch {
      return String(eventDateStr);
    }
  }

  private fmtHourSlot(timeStr: string | null): string {
    if (!timeStr) return '—';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    const h = parseInt(parts[0], 10);
    const m = parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
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
    quote?: Quote | null,
  ): string {
    const clientName  = contract.client?.nombre  ?? 'N/D';
    const clientPhone = contract.client?.telefono ?? '';
    const totalPagado = contract.deposito_pagado;
    const saldo       = Math.max(0, contract.saldo_pendiente);

    // Package and Snack details
    let packageName = 'No especificado';
    let snackName = 'No especificada';
    const extras: QuoteItem[] = [];

    if (quote?.items) {
      for (const item of quote.items) {
        if (item.descripcion.startsWith('Merienda:')) {
          snackName = item.descripcion.replace('Merienda:', '').trim();
        } else if (packageName === 'No especificado') {
          packageName = item.descripcion;
        } else {
          extras.push(item);
        }
      }
    }

    const extrasHtml = extras.length > 0 ? `
      <hr class="sep-dashed" />
      <div class="bold xs" style="margin-bottom:1mm; text-align:left;">EXTRAS CONTRATADOS:</div>
      <table style="width:100%">
        ${extras.map(e => `
          <tr>
            <td class="xs" style="text-align:left">${e.descripcion} x${e.cantidad}</td>
            <td class="r xs" style="text-align:right">${this.fmt(e.cantidad * e.precio_unitario)}</td>
          </tr>
        `).join('')}
      </table>
    ` : '';

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
  <div class="section-title">${payment.tipo === 'modificacion' ? '— PAGO POR MODIFICACIÓN —' : '— COMPROBANTE DE PAGO —'}</div>
  <hr class="sep-solid" />

  <table style="width:100%">
    <tr>
      <td class="xs" style="text-align:left">Contrato</td>
      <td class="r bold" style="text-align:right">${contract.folio}</td>
    </tr>
    ${quote?.folio ? `
    <tr>
      <td class="xs" style="text-align:left">Cotización</td>
      <td class="r sm" style="text-align:right">${quote.folio}</td>
    </tr>
    ` : ''}
    <tr>
      <td class="xs" style="text-align:left">Fecha pago</td>
      <td class="r sm" style="text-align:right">${this.fmtDate(payment.fecha)} ${this.fmtTime(payment.created_at)}</td>
    </tr>
  </table>

  <hr class="sep-dashed" />

  <table style="width:100%">
    <tr>
      <td class="xs" style="text-align:left">Cliente</td>
      <td class="r sm bold" style="text-align:right">${clientName}</td>
    </tr>
    ${clientPhone ? `
    <tr>
      <td class="xs" style="text-align:left">Teléfono</td>
      <td class="r sm" style="text-align:right">${clientPhone}</td>
    </tr>` : ''}
  </table>

  <hr class="sep-solid" />
  <div class="center bold xs" style="padding:0.5mm 0">DATOS DEL EVENTO</div>
  <hr class="sep-dashed" />

  <table style="width:100%">
    <tr>
      <td class="xs" style="text-align:left">Fecha Evento</td>
      <td class="r sm" style="text-align:right">${this.fmtEventDate(contract.fecha_evento)}</td>
    </tr>
    ${contract.hora_inicio ? `
    <tr>
      <td class="xs" style="text-align:left">Horario</td>
      <td class="r sm" style="text-align:right">${this.fmtHourSlot(contract.hora_inicio)} a ${this.fmtHourSlot(contract.hora_fin)}</td>
    </tr>
    ` : ''}
    ${quote?.guest_count ? `
    <tr>
      <td class="xs" style="text-align:left">Invitados</td>
      <td class="r sm" style="text-align:right">${quote.guest_count}</td>
    </tr>
    ` : ''}
    <tr>
      <td class="xs" style="text-align:left">Paquete</td>
      <td class="r sm bold" style="text-align:right">${packageName}</td>
    </tr>
    <tr>
      <td class="xs" style="text-align:left">Merienda</td>
      <td class="r sm" style="text-align:right">${snackName}</td>
    </tr>
  </table>

  ${extrasHtml}

  <hr class="sep-solid" />

  ${payment.tipo === 'modificacion' ? `
  <div style="border:1px solid #d32f2f;border-radius:3px;padding:2mm 3mm;margin-bottom:2mm;background:#fff5f5">
    <div class="bold xs" style="color:#d32f2f;text-align:center;margin-bottom:1mm">⚠ CARGO ADICIONAL AL CONTRATO</div>
    <div class="xs" style="text-align:center;color:#555;line-height:1.4">
      Este pago corresponde a una modificación de cotización autorizada<br>
      con posterioridad al contrato original.<br>
      <span class="bold">No reemplaza el anticipo inicial.</span>
    </div>
  </div>
  ` : ''}

  <table style="width:100%">
    <tr class="total-row">
      <td class="bold" style="text-align:left">${payment.tipo === 'modificacion' ? 'CARGO MODIFICACIÓN' : 'ESTE PAGO'}</td>
      <td class="r bold" style="text-align:right">${this.fmt(payment.monto)}</td>
    </tr>
  </table>

  <table style="margin-top:1mm; width:100%">
    <tr>
      <td class="xs" style="text-align:left">Forma de pago</td>
      <td class="r bold" style="text-align:right">${PAYMENT_LABELS[payment.metodo] ?? payment.metodo.toUpperCase()}</td>
    </tr>
  </table>

  <hr class="sep-dashed" />

  <table style="width:100%">
    <tr>
      <td class="sm" style="text-align:left">Total contrato</td>
      <td class="r sm" style="text-align:right">${this.fmt(contract.total_contrato)}</td>
    </tr>
    ${quote?.deposit_amount ? `
    <tr>
      <td class="sm" style="text-align:left">Anticipo Req.</td>
      <td class="r sm" style="text-align:right">${this.fmt(quote.deposit_amount)}</td>
    </tr>
    ` : ''}
    <tr>
      <td class="sm" style="text-align:left">Total pagado</td>
      <td class="r sm bold" style="text-align:right">${this.fmt(totalPagado)}</td>
    </tr>
    <tr>
      <td class="sm bold" style="text-align:left">${saldo > 0 ? 'Saldo pendiente' : '✓ LIQUIDADO'}</td>
      <td class="r sm bold" style="text-align:right">${saldo > 0 ? this.fmt(saldo) : ''}</td>
    </tr>
    ${saldo > 0 ? `
    <tr>
      <td class="xs" style="text-align:left">Fecha Lím. Pago</td>
      <td class="r xs bold" style="text-align:right; color:#d32f2f">${this.getPaymentDeadline(contract.fecha_evento)}</td>
    </tr>
    ` : ''}
  </table>

  ${payment.notas ? `
  <hr class="sep-dashed" />
  <div class="sm" style="padding:1mm 0; text-align:left">Notas Pago: ${payment.notas}</div>` : ''}
  
  ${contract.notas ? `
  <hr class="sep-dashed" />
  <div class="sm" style="padding:1mm 0; text-align:left">Notas Contrato: ${contract.notas}</div>` : ''}

  <hr class="sep-solid" />

  <div class="footer-msg bold">¡Gracias por su confianza!</div>
  <div class="center xs" style="margin-top:3mm;color:#555">
    ${venue?.nombre ?? 'Hula Hoop'} &bull; ${new Date().getFullYear()}
  </div>

</body>
</html>`;
  }
}
