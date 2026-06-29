import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ContractService } from '../../../../core/services/contract.service';
import { VenueService } from '../../../../core/services/venue.service';
import { QuoteService } from '../../../../core/services/quote.service';
import { QuoteAmendmentService } from '../../../../core/services/quote-amendment.service';
import type { Contract } from '../../../../core/interfaces/contract';
import type { Quote } from '../../../../core/interfaces/quote';
import type { QuoteAmendment } from '../../../../core/interfaces/quote-amendment';

@Component({
  selector: 'app-contract-public-page',
  templateUrl: './contract-public-page.html',
  imports: [CommonModule, CurrencyPipe, RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractPublicPage implements AfterViewInit {
  private readonly contractService  = inject(ContractService);
  private readonly venueService     = inject(VenueService);
  private readonly quoteService     = inject(QuoteService);
  private readonly amendmentService = inject(QuoteAmendmentService);
  private readonly route            = inject(ActivatedRoute);
  private readonly router           = inject(Router);

  readonly loading            = signal(true);
  readonly notFound           = signal(false);
  readonly contract           = signal<Contract | null>(null);
  readonly quote              = signal<Quote | null>(null);
  readonly venueSlug          = signal<string | null>(null);
  readonly submitting         = signal(false);

  readonly amendment           = signal<QuoteAmendment | null>(null);
  readonly approvedAmendments  = signal<QuoteAmendment[]>([]);
  readonly amendmentApproving  = signal(false);
  readonly amendmentRejecting  = signal(false);
  readonly amendmentDone       = signal<'approved' | 'rejected' | null>(null);

  // Wizard state: 1 = INE, 2 = Comprobante, 3 = Firma, 4 = Success
  readonly currentStep     = signal(1);

  // Upload progress/status
  readonly uploadingIne    = signal(false);
  readonly uploadingComp   = signal(false);
  readonly ineUrl          = signal<string | null>(null);
  readonly compUrl         = signal<string | null>(null);

  // Signature state
  readonly signName        = signal('');
  readonly acceptTerms     = signal(false);
  readonly signatureSaved  = signal(false);
  readonly isCanvasSigned  = signal(false);

  @ViewChild('sigCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private isDrawing = false;
  private ctx: CanvasRenderingContext2D | null = null;

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.notFound.set(true);
      this.loading.set(false);
    } else {
      this.loadContract(id);
    }
  }

  ngAfterViewInit() {
    // If we start at step 3 directly (e.g. if files are already uploaded)
    if (this.currentStep() === 3) {
      setTimeout(() => this.initCanvas(), 100);
    }
  }

  private async loadContract(id: string): Promise<void> {
    const c = await this.contractService.getById(id);
    if (!c) {
      this.notFound.set(true);
    } else {
      this.contract.set(c);
      this.ineUrl.set(c.ine_url || null);
      this.compUrl.set(c.comprobante_url || null);

      if (c.quote_id) {
        const q = await this.quoteService.getById(c.quote_id);
        this.quote.set(q);
      }

      const activeAmendment = await this.amendmentService.getActiveByContract(id);
      this.amendment.set(activeAmendment);

      const approved = await this.amendmentService.getApprovedByContract(id);
      this.approvedAmendments.set(approved);

      // Determine starting step based on already uploaded documents
      if (!c.ine_url) {
        this.currentStep.set(1);
      } else if (!c.comprobante_url) {
        this.currentStep.set(2);
      } else if (c.estado !== 'firmado') {
        this.currentStep.set(3);
        setTimeout(() => this.initCanvas(), 100);
      } else {
        this.currentStep.set(4);
      }

      const venue = await this.venueService.getVenueById(c.venue_id);
      this.venueSlug.set(venue?.slug ?? null);
    }
    this.loading.set(false);
  }

  goToStep(step: number) {
    if (step === 3) {
      if (!this.ineUrl()) {
        alert('Por favor sube tu INE antes de continuar.');
        return;
      }
      if (!this.compUrl()) {
        alert('Por favor sube tu comprobante de domicilio antes de continuar.');
        return;
      }
    }
    this.currentStep.set(step);
    if (step === 3) {
      setTimeout(() => this.initCanvas(), 100);
    }
  }

  // --- Upload Handlers ---
  async onFileSelected(event: any, type: 'ine' | 'comprobante') {
    const file = event.target.files?.[0];
    if (!file) return;

    const c = this.contract();
    if (!c) return;

    if (type === 'ine') {
      this.uploadingIne.set(true);
      const url = await this.contractService.uploadDocument(c.id, 'ine', file);
      if (url) {
        this.ineUrl.set(url);
      } else {
        alert('Ocurrió un error al subir la identificación.');
      }
      this.uploadingIne.set(false);
    } else {
      this.uploadingComp.set(true);
      const url = await this.contractService.uploadDocument(c.id, 'comprobante', file);
      if (url) {
        this.compUrl.set(url);
      } else {
        alert('Ocurrió un error al subir el comprobante.');
      }
      this.uploadingComp.set(false);
    }
  }

  // --- Signature Canvas Methods ---
  initCanvas() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    this.ctx = canvas.getContext('2d');
    if (this.ctx) {
      this.ctx.strokeStyle = '#020617'; // slate-950
      this.ctx.lineWidth = 3;
      this.ctx.lineCap = 'round';
      
      // Handle resizing and High-DPI screens
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
  }

  startDrawing(event: MouseEvent) {
    this.isDrawing = true;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    this.ctx?.beginPath();
    this.ctx?.moveTo(event.clientX - rect.left, event.clientY - rect.top);
    this.isCanvasSigned.set(true);
  }

  draw(event: MouseEvent) {
    if (!this.isDrawing || !this.ctx) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    this.ctx.lineTo(event.clientX - rect.left, event.clientY - rect.top);
    this.ctx.stroke();
  }

  startDrawingTouch(event: TouchEvent) {
    event.preventDefault();
    this.isDrawing = true;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches[0];
    this.ctx?.beginPath();
    this.ctx?.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
    this.isCanvasSigned.set(true);
  }

  drawTouch(event: TouchEvent) {
    event.preventDefault();
    if (!this.isDrawing || !this.ctx) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches[0];
    this.ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
    this.ctx.stroke();
  }

  stopDrawing() {
    this.isDrawing = false;
  }

  clearCanvas() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.ctx) return;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.isCanvasSigned.set(false);
  }

  getCanvasBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const canvas = this.canvasRef?.nativeElement;
      if (!canvas) {
        resolve(null);
        return;
      }
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  }

  // --- Final signature and submission ---
  async finishSigning() {
    const c = this.contract();
    if (!c || this.submitting()) return;

    if (!this.acceptTerms()) {
      alert('Debes aceptar los términos y condiciones para continuar.');
      return;
    }

    if (!this.signName().trim()) {
      alert('Por favor escribe tu nombre completo como firma.');
      return;
    }

    if (!this.isCanvasSigned()) {
      alert('Por favor dibuja tu firma en el recuadro.');
      return;
    }

    this.submitting.set(true);

    try {
      // 1. Get canvas blob and upload signature image to Supabase
      const blob = await this.getCanvasBlob();
      let signatureUrl: string | null = null;
      
      if (blob) {
        const file = new File([blob], `signature_${c.id}.png`, { type: 'image/png' });
        signatureUrl = await this.contractService.uploadDocument(c.id, 'firma', file);
      }

      // 2. Update contract info
      const today = new Date().toISOString().split('T')[0];
      const appendedNote = c.notas 
        ? `${c.notas}\n\n[CONTRATO FIRMADO DIGITALMENTE por: ${this.signName().trim()} el ${today}]`
        : `[CONTRATO FIRMADO DIGITALMENTE por: ${this.signName().trim()} el ${today}]`;

      const updated = await this.contractService.update(c.id, {
        estado: 'firmado',
        fecha_firma: today,
        notas: appendedNote,
        firma_url: signatureUrl
      });

      if (updated) {
        this.contract.set(updated);
        this.currentStep.set(4);
      } else {
        alert('Error al guardar la firma del contrato. Intenta de nuevo.');
      }
    } catch (error: any) {
      console.error('Error in finishSigning:', error);
      alert('Ocurrió un error inesperado al firmar el contrato.');
    } finally {
      this.submitting.set(false);
    }
  }

  async approveAmendment(): Promise<void> {
    const a = this.amendment();
    if (!a || this.amendmentApproving()) return;
    this.amendmentApproving.set(true);
    try {
      const ok = await this.amendmentService.approveViaToken(a.id, a.approval_token);
      if (ok) {
        this.amendmentDone.set('approved');
        const c = this.contract();
        if (c) await this.loadContract(c.id);
      } else {
        alert('No se pudo autorizar la modificación. Es posible que ya haya sido procesada. Por favor recarga la página.');
      }
    } finally {
      this.amendmentApproving.set(false);
    }
  }

  async rejectAmendment(): Promise<void> {
    const a = this.amendment();
    if (!a || this.amendmentRejecting()) return;
    this.amendmentRejecting.set(true);
    const ok = await this.amendmentService.rejectViaToken(a.id, a.approval_token);
    this.amendmentRejecting.set(false);
    if (ok) {
      this.amendmentDone.set('rejected');
      this.amendment.set(null);
    }
  }

  viewContract(): void {
    const c = this.contract();
    if (!c) return;
    const win = window.open('', '_blank');
    if (!win) return;

    const q = this.quote();
    const amendments = this.approvedAmendments();
    const pkg = this.getContractPackage(q);
    const pkgPrice = this.getContractPackagePrice(q);
    const snack = this.getContractSnack(q);

    const formatPrintList = (items: { text: string; price: number }[]) => {
      if (items.length === 0) {
        return `
          <div style="display: flex; justify-content: space-between; padding: 8px 12px;">
            <span style="color: #64748b;">—</span>
            <span style="color: #64748b;">—</span>
          </div>
        `;
      }
      return items.map((it, idx) => {
        const borderStyle = idx < items.length - 1 ? 'border-bottom: 1px solid #cbd5e1;' : '';
        let priceStr = '—';
        if (it.price > 0) {
          priceStr = `$${it.price.toLocaleString('es-MX')} MXN`;
        } else {
          if (it.text.toLowerCase().includes('cobro en local') || it.text.toLowerCase().includes('en local')) {
            priceStr = 'Cobro en local';
          } else {
            priceStr = 'Incluido';
          }
        }
        return `
          <div style="display: flex; justify-content: space-between; padding: 8px 12px; ${borderStyle}">
            <span>${it.text}</span>
            <span style="font-weight: bold; text-align: right; white-space: nowrap; margin-left: 20px;">${priceStr}</span>
          </div>
        `;
      }).join('');
    };

    const activitiesHtml = formatPrintList(this.getContractActivitiesWithPrices(q));
    const decorationsHtml = formatPrintList(this.getContractDecorationsWithPrices(q));
    const glamHtml = formatPrintList(this.getContractGlamWithPrices(q));
    const extrasHtml = formatPrintList(this.getContractExtrasWithPrices(q));

    let snackPriceHtml = '—';
    if (snack !== '—') {
      const snackPrice = this.getContractSnackPrice(q);
      snackPriceHtml = snackPrice > 0 ? `$${snackPrice.toLocaleString('es-MX')} MXN` : 'Incluido';
    }

    const fechaEvento = c.fecha_evento
      ? new Date(c.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' })
      : '—';
    const fechaCelebracion = c.fecha_firma
      ? new Date(c.fecha_firma + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' })
      : new Date().toLocaleDateString('es-MX', { dateStyle: 'long' });

    const fmtTime = (t: string | null | undefined) => {
      if (!t) return '—';
      const [h, m] = t.split(':');
      const hour = parseInt(h, 10);
      return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
    };

    const addendaHtml = amendments.length > 0 ? `
      <div style="page-break-before:always;margin-top:60px">
        <div style="border:2px solid #e2e8f0;border-radius:6px;padding:24px">
          <div style="font-weight:800;font-size:14px;text-transform:uppercase;color:#0f172a;text-align:center;margin-bottom:4px">
            ADDENDUM AL CONTRATO ${c.folio}
          </div>
          <div style="text-align:center;font-size:11px;color:#64748b;margin-bottom:20px">
            Modificaciones autorizadas por el cliente con posterioridad a la firma del contrato original
          </div>
          ${amendments.map((am, idx) => {
            const fechaAprobacion = am.approved_at
              ? new Date(am.approved_at).toLocaleDateString('es-MX', { dateStyle: 'long' })
              : '—';
            const rows = (am.proposed_items as Array<{descripcion:string;cantidad:number;precio_unitario:number;subtotal:number}>)
              .map(it => `<tr>
                <td style="padding:6px 10px;border:1px solid #e2e8f0">${it.descripcion}</td>
                <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:center">${it.cantidad}</td>
                <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right">$${Number(it.precio_unitario).toLocaleString('es-MX')} MXN</td>
                <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right">$${Number(it.subtotal).toLocaleString('es-MX')} MXN</td>
              </tr>`).join('');
            return `<div style="margin-bottom:24px">
              <div style="font-weight:700;font-size:12px;color:#0f172a;margin-bottom:8px">MODIFICACIÓN ${idx + 1} — Aprobada el ${fechaAprobacion}</div>
              ${am.notas ? `<p style="font-size:11px;color:#475569;margin-bottom:8px">${am.notas}</p>` : ''}
              <table style="width:100%;border-collapse:collapse;font-size:11px">
                <thead><tr style="background:#f8fafc">
                  <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left">Descripción</th>
                  <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:center">Cant.</th>
                  <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right">Precio U.</th>
                  <th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right">Subtotal</th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
              <div style="text-align:right;font-size:12px;font-weight:700;margin-top:8px;color:#0f172a">
                Nuevo total: $${Number(am.proposed_total).toLocaleString('es-MX')} MXN &nbsp;|&nbsp;
                Diferencia: <span style="color:${Number(am.delta_monto)>=0?'#16a34a':'#dc2626'}">${Number(am.delta_monto)>=0?'+':''}$${Number(am.delta_monto).toLocaleString('es-MX')} MXN</span>
              </div>
            </div>`;
          }).join('<hr style="border:none;border-top:1px dashed #e2e8f0;margin:16px 0">')}
          <div style="margin-top:20px;font-size:11px;color:#334155">
            Las partes ratifican su conformidad con las modificaciones aquí descritas.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:40px;text-align:center">
            <div>
              <div style="height:50px;display:flex;align-items:flex-end;justify-content:center">
                ${c.firma_representante_url ? `<img src="${c.firma_representante_url}" style="max-height:45px"/>` : '<span style="font-style:italic;color:#94a3b8;font-size:12px">Hula Hoop Eventos</span>'}
              </div>
              <div style="border-top:1px solid #475569;margin-top:10px;padding-top:8px;font-size:12px;font-weight:600">Por EL PRESTADOR<br>HULA HOOP EVENTOS</div>
            </div>
            <div>
              <div style="height:50px;display:flex;align-items:flex-end;justify-content:center">
                ${c.firma_url ? `<img src="${c.firma_url}" style="max-height:45px"/>` : ''}
              </div>
              <div style="border-top:1px solid #475569;margin-top:10px;padding-top:8px;font-size:12px;font-weight:600">Por EL CLIENTE<br>${c.client?.nombre ?? '________________________'}</div>
            </div>
          </div>
        </div>
      </div>` : '';

    win.document.write(`<!DOCTYPE html><html lang="es"><head>
      <meta charset="UTF-8">
      <title>Contrato ${c.folio} — Hula Hoop</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#334155;line-height:1.6;padding:50px 60px;background:#fff;font-size:13px;text-align:justify}
        .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:35px;padding-bottom:15px;border-bottom:2px solid #e2e8f0}
        .logo{font-size:24px;font-weight:800;color:#E30D1C;letter-spacing:-0.5px}
        .title{font-size:15px;font-weight:800;text-align:center;text-transform:uppercase;margin:30px 0 20px 0;color:#1e293b}
        .section-title{font-weight:700;text-transform:uppercase;margin:20px 0 10px 0;font-size:12px;color:#0f172a}
        p{margin-bottom:12px;text-indent:24px}
        ol{margin:10px 0 15px 30px} ol li{margin-bottom:8px}
        .details-table{width:100%;border-collapse:collapse;margin:20px 0;font-size:12px}
        .details-table td{padding:8px 12px;border:1px solid #cbd5e1}
        .details-table td.label{font-weight:700;background:#f8fafc;width:25%}
        .signatures{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:60px;page-break-inside:avoid;text-align:center}
        .sig-line{border-top:1px solid #475569;margin-top:10px;padding-top:8px;font-size:12px;font-weight:600}
        .footer{margin-top:60px;border-top:1px solid #e2e8f0;padding-top:15px;font-size:10px;color:#94a3b8;text-align:center}
        @media print{body{padding:20px 30px}}
      </style>
    </head><body>
      <div class="header">
        <div class="logo">HULA HOOP</div>
        <div style="text-align:right">
          <div style="font-weight:700;font-size:14px">CONTRATO DE ADHESIÓN</div>
          <div style="color:#64748b;font-size:12px">FOLIO: ${c.folio}</div>
        </div>
      </div>
      <div class="title">CONTRATO DE PRESTACIÓN DE SERVICIOS PARA EVENTO SOCIAL</div>
      <p>CONTRATO DE PRESTACIÓN DE SERVICIOS QUE CELEBRAN, POR UNA PARTE, EL SALÓN DE EVENTOS HULA HOOP (EN LO SUCESIVO <strong>"EL PRESTADOR"</strong>), Y POR LA OTRA PARTE, LA PERSONA CUYOS DATOS APARECEN EN LA TABLA DE ESPECIFICACIONES DE ESTE DOCUMENTO (EN LO SUCESIVO <strong>"EL CLIENTE"</strong>), AL TENOR DE LAS SIGUIENTES DECLARACIONES Y CLÁUSULAS:</p>
      <div class="section-title">ESPECIFICACIONES DEL SERVICIO Y EVENTO</div>
      <table class="details-table">
        <tr>
          <td class="label">Cliente</td>
          <td colspan="2">${c.client?.nombre ?? '—'}</td>
        </tr>
        <tr>
          <td class="label">Contacto</td>
          <td colspan="2">${c.client?.telefono ?? '—'} / ${c.client?.email ?? '—'}</td>
        </tr>
        <tr>
          <td class="label">Fecha Evento</td>
          <td colspan="2">${fechaEvento}</td>
        </tr>
        <tr>
          <td class="label">Horario</td>
          <td colspan="2">De ${fmtTime(c.hora_inicio)} a ${fmtTime(c.hora_fin)}</td>
        </tr>
        <tr>
          <td class="label">Paquete Contratado</td>
          <td>${pkg}</td>
          <td style="text-align: right; font-weight: bold;">$${pkgPrice.toLocaleString('es-MX')} MXN</td>
        </tr>
        <tr>
          <td class="label">Merienda</td>
          <td>${snack}</td>
          <td style="text-align: right; font-weight: bold;">${snackPriceHtml}</td>
        </tr>
        <tr>
          <td class="label">Actividad</td>
          <td style="padding: 0;" colspan="2">${activitiesHtml}</td>
        </tr>
        <tr>
          <td class="label">Decoración</td>
          <td style="padding: 0;" colspan="2">${decorationsHtml}</td>
        </tr>
        <tr>
          <td class="label">Glam Girls</td>
          <td style="padding: 0;" colspan="2">${glamHtml}</td>
        </tr>
        <tr>
          <td class="label">Extras</td>
          <td style="padding: 0;" colspan="2">${extrasHtml}</td>
        </tr>
        <tr>
          <td class="label">Total Contrato</td>
          <td></td>
          <td style="text-align: right; font-weight: bold; font-size: 13px;">$${c.total_contrato.toLocaleString('es-MX')} MXN</td>
        </tr>
        <tr>
          <td class="label" style="color:#16a34a;">Anticipo Pagado</td>
          <td></td>
          <td style="text-align: right; font-weight: bold; color:#16a34a; font-size: 13px;">$${c.deposito_pagado.toLocaleString('es-MX')} MXN</td>
        </tr>
        <tr>
          <td class="label" style="color:#dc2626;">Saldo Pendiente</td>
          <td></td>
          <td style="text-align: right; font-weight: bold; color:#dc2626; font-size: 13px;">$${c.saldo_pendiente.toLocaleString('es-MX')} MXN</td>
        </tr>
      </table>
      <div class="section-title">CLÁUSULAS</div>
      <ol>
        <li><strong>PRIMERA (OBJETO):</strong> "EL PRESTADOR" se obliga a prestar el servicio de renta del salón de eventos Hula Hoop para la realización del evento social de "EL CLIENTE", de conformidad con los términos descritos en el presente contrato.</li>
        <li><strong>SEGUNDA (PRECIO Y CONDICIONES DE PAGO):</strong> "EL CLIENTE" se obliga a pagar a "EL PRESTADOR" la cantidad total señalada como "Total Contrato". El anticipo reserva la fecha. El saldo pendiente deberá liquidarse antes del inicio del evento.</li>
        <li><strong>TERCERA (POLÍTICA DE CANCELACIÓN):</strong> Cualquier cancelación por parte de "EL CLIENTE" implicará la pérdida total del anticipo pagado. El cambio de fecha queda sujeto a disponibilidad.</li>
        <li><strong>CUARTA (REGLAMENTO INTERNO):</strong> "EL CLIENTE" y sus invitados se obligan a observar las normas de uso y seguridad de las instalaciones, respondiendo por cualquier daño causado.</li>
        <li><strong>QUINTA (VIGENCIA Y JURISDICCIÓN):</strong> El presente contrato surte efectos desde la firma de ambas partes. Las partes se someten a las leyes y tribunales de la localidad del establecimiento.</li>
      </ol>
      <p style="margin-top:20px;text-indent:0">Leído por las partes y enterados de su alcance legal, se firma por duplicado el día ${fechaCelebracion}.</p>
      <div class="signatures">
        <div>
          <div style="height:60px;display:flex;align-items:flex-end;justify-content:center">
            ${c.firma_representante_url ? `<img src="${c.firma_representante_url}" style="max-height:55px"/>` : '<span style="font-style:italic;color:#94a3b8;font-size:13px">Hula Hoop Eventos</span>'}
          </div>
          <div class="sig-line">Por EL PRESTADOR<br>HULA HOOP EVENTOS</div>
        </div>
        <div>
          <div style="height:60px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end">
            ${c.firma_url ? `<img src="${c.firma_url}" style="max-height:55px"/>` : ''}
          </div>
          <div class="sig-line">Por EL CLIENTE<br>${c.client?.nombre ?? '________________________'}</div>
          ${c.fecha_firma ? `<div style="font-size:9px;color:#64748b;margin-top:4px">Firmado digitalmente el ${fechaCelebracion}</div>` : ''}
        </div>
      </div>
      ${addendaHtml}
      <div class="footer">Hula Hoop · info@hulahoop.mx</div>
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const date = new Date(year, month, day);
        return date.toLocaleDateString('es-MX', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
      return new Date(dateStr).toLocaleDateString('es-MX', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  formatTime(time: string | null | undefined): string {
    if (!time) return '—';
    const timePart = time.includes('T') ? time.split('T')[1] : time;
    const [h, m] = timePart.split(':');
    const hour = parseInt(h, 10);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  }

  getContractPackage(quote: any): string {
    if (!quote || !quote.items || quote.items.length === 0) return '—';
    return quote.items[0]?.descripcion || '—';
  }

  getContractPackagePrice(quote: any): number {
    if (!quote || !quote.items || quote.items.length === 0) return 0;
    return quote.items[0]?.subtotal ?? 0;
  }

  getContractSnack(quote: any): string {
    if (!quote) return '—';
    if (quote.snack_option?.name) return quote.snack_option.name;
    if (!quote.items) return '—';
    const snackItem = quote.items.find((it: any) => it.descripcion.startsWith('Merienda:'));
    if (!snackItem) return '—';
    return snackItem.descripcion.replace(/^Merienda:\s*/, '');
  }

  getContractSnackPrice(quote: any): number {
    if (!quote || !quote.items) return 0;
    const snackItem = quote.items.find((it: any) => it.descripcion.startsWith('Merienda:'));
    return snackItem?.subtotal ?? 0;
  }

  getContractActivities(quote: any): string[] {
    if (!quote || !quote.items) return [];
    return quote.items
      .filter((it: any) => it.descripcion.startsWith('Actividad Premium:') || it.descripcion.startsWith('Actividad Incluida:'))
      .map((it: any) => `+ ${it.descripcion} (x${it.cantidad})`);
  }

  getContractActivitiesWithPrices(quote: any): { text: string; price: number }[] {
    if (!quote || !quote.items) return [];
    return quote.items
      .filter((it: any) => it.descripcion.startsWith('Actividad Premium:') || it.descripcion.startsWith('Actividad Incluida:'))
      .map((it: any) => ({
        text: `+ ${it.descripcion} (x${it.cantidad})`,
        price: it.subtotal ?? 0
      }));
  }

  getContractDecorations(quote: any): string[] {
    if (!quote || !quote.items) return [];
    return quote.items
      .filter((it: any) => it.descripcion.startsWith('Upgrade de Decoración:') || it.descripcion.includes('Decoración'))
      .map((it: any) => `+ ${it.descripcion} (x${it.cantidad})`);
  }

  getContractDecorationsWithPrices(quote: any): { text: string; price: number }[] {
    if (!quote || !quote.items) return [];
    return quote.items
      .filter((it: any) => it.descripcion.startsWith('Upgrade de Decoración:') || it.descripcion.includes('Decoración'))
      .map((it: any) => ({
        text: `+ ${it.descripcion} (x${it.cantidad})`,
        price: it.subtotal ?? 0
      }));
  }

  getContractGlam(quote: any): string[] {
    if (!quote || !quote.items) return [];
    return quote.items
      .filter((it: any) => it.descripcion.includes('Glam Girls'))
      .map((it: any) => `+ ${it.descripcion} (x${it.cantidad})`);
  }

  getContractGlamWithPrices(quote: any): { text: string; price: number }[] {
    if (!quote || !quote.items) return [];
    return quote.items
      .filter((it: any) => it.descripcion.includes('Glam Girls'))
      .map((it: any) => ({
        text: `+ ${it.descripcion} (x${it.cantidad})`,
        price: it.subtotal ?? 0
      }));
  }

  getContractExtrasList(quote: any): string[] {
    if (!quote || !quote.items) return [];
    const pkgDesc = this.getContractPackage(quote);
    return quote.items
      .filter((it: any) => {
        const desc = it.descripcion;
        if (desc === pkgDesc) return false;
        if (desc.startsWith('Merienda:')) return false;
        if (desc.startsWith('Actividad Premium:') || desc.startsWith('Actividad Incluida:')) return false;
        if (desc.startsWith('Upgrade de Decoración:') || desc.includes('Decoración')) return false;
        if (desc.includes('Glam Girls')) return false;
        return true;
      })
      .map((it: any) => `+ ${it.descripcion} (x${it.cantidad})`);
  }

  getContractExtrasWithPrices(quote: any): { text: string; price: number }[] {
    if (!quote || !quote.items) return [];
    const pkgDesc = this.getContractPackage(quote);
    return quote.items
      .filter((it: any) => {
        const desc = it.descripcion;
        if (desc === pkgDesc) return false;
        if (desc.startsWith('Merienda:')) return false;
        if (desc.startsWith('Actividad Premium:') || desc.startsWith('Actividad Incluida:')) return false;
        if (desc.startsWith('Upgrade de Decoración:') || desc.includes('Decoración')) return false;
        if (desc.includes('Glam Girls')) return false;
        return true;
      })
      .map((it: any) => ({
        text: `+ ${it.descripcion} (x${it.cantidad})`,
        price: it.subtotal ?? 0
      }));
  }

  getContractExtras(quote: any): string {
    if (!quote || !quote.items) return '—';
    const packageDesc = this.getContractPackage(quote);
    const extras = quote.items.filter((it: any) => 
      it.descripcion !== packageDesc && !it.descripcion.startsWith('Merienda:')
    );
    if (extras.length === 0) return '—';
    return extras.map((it: any) => `${it.descripcion} (x${it.cantidad})`).join(', ');
  }
}
