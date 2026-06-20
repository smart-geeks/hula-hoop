import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
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
  imports: [CommonModule, CurrencyPipe, DatePipe, RouterLink, FormsModule],
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

  readonly amendment          = signal<QuoteAmendment | null>(null);
  readonly amendmentApproving = signal(false);
  readonly amendmentRejecting = signal(false);
  readonly amendmentDone      = signal<'approved' | 'rejected' | null>(null);

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
    const ok = await this.amendmentService.approveViaToken(a.id, a.approval_token);
    this.amendmentApproving.set(false);
    if (ok) {
      this.amendmentDone.set('approved');
      // Reload contract to reflect new totals
      const c = this.contract();
      if (c) await this.loadContract(c.id);
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

  getContractSnack(quote: any): string {
    if (!quote || !quote.items) return '—';
    const snackItem = quote.items.find((it: any) => it.descripcion.startsWith('Merienda:'));
    if (!snackItem) return '—';
    return snackItem.descripcion.replace(/^Merienda:\s*/, '');
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
