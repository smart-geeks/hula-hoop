import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { ReportService } from '../../../../core/services/report.service';
import { EXPENSE_CATEGORIES } from '../../../../core/interfaces/expense';
import { INVENTORY_CATEGORIES } from '../../../../core/interfaces/inventory';
import type {
  EventoRow,
  PLGlobalRow,
  PipelineRow,
  ClienteRow,
  ProveedorRow,
  InventarioRow,
  GastoRow,
  GastoCategoriaRow,
  FlujoCajaRow,
} from '../../../../core/services/report.service';

export type ReportTab =
  | 'eventos'
  | 'pl_global'
  | 'pipeline'
  | 'clientes'
  | 'proveedores'
  | 'inventario'
  | 'gastos'
  | 'flujo_caja';

const TABS: { id: ReportTab; label: string; icon: string }[] = [
  { id: 'eventos',      label: 'Eventos',       icon: 'pi-calendar' },
  { id: 'pl_global',   label: 'P&L Global',     icon: 'pi-chart-bar' },
  { id: 'pipeline',    label: 'Pipeline',        icon: 'pi-filter' },
  { id: 'clientes',    label: 'Clientes',        icon: 'pi-users' },
  { id: 'proveedores', label: 'Proveedores',     icon: 'pi-truck' },
  { id: 'inventario',  label: 'Inventario',      icon: 'pi-box' },
  { id: 'gastos',      label: 'Gastos',          icon: 'pi-wallet' },
  { id: 'flujo_caja',  label: 'Flujo de Caja',   icon: 'pi-arrow-right-arrow-left' },
];

@Component({
  selector: 'app-admin-reports',
  templateUrl: './admin-reports.html',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, DecimalPipe, PercentPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReports {
  private readonly reportService = inject(ReportService);
  private readonly fb = inject(FormBuilder);

  readonly tabs = TABS;
  readonly expenseCategories   = EXPENSE_CATEGORIES;
  readonly inventoryCategories = INVENTORY_CATEGORIES;

  readonly activeTab = signal<ReportTab>('eventos');
  readonly loading   = signal(false);
  readonly toast     = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  readonly filterForm = this.fb.group({
    from:      [this.firstOfMonth()],
    to:        [this.today()],
    estado:    [''],
    categoria: [''],
  });

  readonly eventosData     = signal<EventoRow[]>([]);
  readonly plData          = signal<PLGlobalRow | null>(null);
  readonly pipelineData    = signal<PipelineRow[]>([]);
  readonly clientesData    = signal<ClienteRow[]>([]);
  readonly proveedoresData = signal<ProveedorRow[]>([]);
  readonly inventarioData  = signal<InventarioRow[]>([]);
  readonly gastosRows      = signal<GastoRow[]>([]);
  readonly gastosCat       = signal<GastoCategoriaRow[]>([]);
  readonly flujoCajaData   = signal<FlujoCajaRow[]>([]);

  readonly eventosTotal = computed(() =>
    this.eventosData().reduce((s, r) => s + r.total_contrato, 0));

  readonly eventosSaldo = computed(() =>
    this.eventosData().reduce((s, r) => s + r.saldo_pendiente, 0));

  readonly gastosTotal = computed(() =>
    this.gastosRows().reduce((s, r) => s + r.monto, 0));

  readonly inventarioValor = computed(() =>
    this.inventarioData().reduce((s, r) => s + r.valor_inventario, 0));

  readonly inventarioAlertas = computed(() =>
    this.inventarioData().filter((r) => r.alerta).length);

  readonly flujoCajaTotalEntradas = computed(() =>
    this.flujoCajaData().filter((r) => r.tipo === 'entrada').reduce((s, r) => s + r.monto, 0));

  readonly flujoCajaTotalSalidas = computed(() =>
    this.flujoCajaData().filter((r) => r.tipo === 'salida').reduce((s, r) => s + r.monto, 0));

  readonly pipelineTotal = computed(() =>
    this.pipelineData().reduce((s, r) => s + r.total, 0));

  readonly pipelineTotalItems = computed(() =>
    this.pipelineData().reduce((s, r) => s + r.cantidad, 0));

  constructor() {
    this.loadActiveReport();
  }

  async setTab(tab: ReportTab): Promise<void> {
    this.activeTab.set(tab);
    await this.loadActiveReport();
  }

  async loadActiveReport(): Promise<void> {
    const { from, to, estado, categoria } = this.filterForm.getRawValue();
    const f = from ?? this.firstOfMonth();
    const t = to ?? this.today();

    this.loading.set(true);
    const tab = this.activeTab();

    try {
      if (tab === 'eventos') {
        const data = await this.reportService.getEventos(f, t, estado || undefined);
        this.eventosData.set(data);
      } else if (tab === 'pl_global') {
        const data = await this.reportService.getPLGlobal(f, t);
        this.plData.set(data);
      } else if (tab === 'pipeline') {
        const data = await this.reportService.getPipeline(f, t);
        this.pipelineData.set(data);
      } else if (tab === 'clientes') {
        const data = await this.reportService.getClientes(f, t);
        this.clientesData.set(data);
      } else if (tab === 'proveedores') {
        const data = await this.reportService.getProveedores(f, t);
        this.proveedoresData.set(data);
      } else if (tab === 'inventario') {
        const data = await this.reportService.getInventario(categoria || undefined);
        this.inventarioData.set(data);
      } else if (tab === 'gastos') {
        const result = await this.reportService.getGastos(f, t, categoria || undefined);
        this.gastosRows.set(result.rows);
        this.gastosCat.set(result.byCategory);
      } else if (tab === 'flujo_caja') {
        const data = await this.reportService.getFlujoCaja(f, t);
        this.flujoCajaData.set(data);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async exportExcel(): Promise<void> {
    const { utils, writeFile } = await import('xlsx');
    const tab = this.activeTab();
    let ws: ReturnType<typeof utils.json_to_sheet>;
    let filename = '';

    const fmt = (n: number) => n.toFixed(2);

    if (tab === 'eventos') {
      ws = utils.json_to_sheet(
        this.eventosData().map((r) => ({
          Folio: r.folio, Cliente: r.cliente, 'Fecha Evento': r.fecha_evento,
          Estado: r.estado, 'Total Contrato': fmt(r.total_contrato),
          'Depósito Pagado': fmt(r.deposito_pagado), 'Saldo Pendiente': fmt(r.saldo_pendiente),
        })),
      );
      filename = 'reporte-eventos.xlsx';
    } else if (tab === 'clientes') {
      ws = utils.json_to_sheet(
        this.clientesData().map((r) => ({
          Cliente: r.nombre, Email: r.email, Teléfono: r.telefono,
          Eventos: r.num_eventos, 'Total Facturado': fmt(r.total_facturado), 'Último Evento': r.ultimo_evento,
        })),
      );
      filename = 'reporte-clientes.xlsx';
    } else if (tab === 'proveedores') {
      ws = utils.json_to_sheet(
        this.proveedoresData().map((r) => ({
          Proveedor: r.nombre, Categoría: r.categoria,
          Compras: r.num_compras, 'Total Compras': fmt(r.total_compras), 'Última Compra': r.ultima_compra,
        })),
      );
      filename = 'reporte-proveedores.xlsx';
    } else if (tab === 'inventario') {
      ws = utils.json_to_sheet(
        this.inventarioData().map((r) => ({
          Nombre: r.nombre, SKU: r.sku, Categoría: r.categoria, Unidad: r.unidad,
          'Stock Actual': r.stock_actual, 'Stock Mínimo': r.stock_minimo,
          'Precio Costo': fmt(r.precio_costo), 'Precio Venta': fmt(r.precio_venta),
          'Valor Inventario': fmt(r.valor_inventario), Alerta: r.alerta ? 'Sí' : 'No',
        })),
      );
      filename = 'reporte-inventario.xlsx';
    } else if (tab === 'gastos') {
      ws = utils.json_to_sheet(
        this.gastosRows().map((r) => ({
          Fecha: r.fecha, Categoría: r.categoria, Descripción: r.descripcion,
          Monto: fmt(r.monto), Evento: r.evento, Proveedor: r.proveedor,
        })),
      );
      filename = 'reporte-gastos.xlsx';
    } else if (tab === 'flujo_caja') {
      ws = utils.json_to_sheet(
        this.flujoCajaData().map((r) => ({
          Fecha: r.fecha, Concepto: r.concepto,
          Tipo: r.tipo === 'entrada' ? 'Entrada' : 'Salida',
          Monto: fmt(r.monto), 'Saldo Acumulado': fmt(r.saldo_acumulado ?? 0),
        })),
      );
      filename = 'flujo-de-caja.xlsx';
    } else {
      this.showToast('error', 'Exportación Excel no disponible para este reporte');
      return;
    }

    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Reporte');
    writeFile(wb, filename);
    this.showToast('success', 'Archivo Excel descargado');
  }

  async exportPdf(): Promise<void> {
    const el = document.getElementById('report-print-area');
    if (!el) return;

    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import('html2canvas') as Promise<{ default: typeof import('html2canvas')['default'] }>,
      import('jspdf') as Promise<{ default: typeof import('jspdf')['default'] }>,
    ]);

    this.loading.set(true);
    try {
      const canvas  = await (html2canvas as any)(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf     = new (jsPDF as any)({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW   = pdf.internal.pageSize.getWidth();
      const pageH   = pdf.internal.pageSize.getHeight();
      const imgW    = pageW;
      const imgH    = (canvas.height * pageW) / canvas.width;
      let y = 0;
      if (imgH <= pageH) {
        pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH);
      } else {
        let offset = 0;
        while (offset < canvas.height) {
          const sliceH      = Math.min(canvas.height - offset, (pageH / pageW) * canvas.width);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width  = canvas.width;
          sliceCanvas.height = sliceH;
          sliceCanvas.getContext('2d')!.drawImage(canvas, 0, -offset);
          if (y > 0) pdf.addPage();
          pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 0, 0, imgW, (sliceH * pageW) / canvas.width);
          offset += sliceH;
          y++;
        }
      }
      pdf.save(`reporte-${this.activeTab()}.pdf`);
      this.showToast('success', 'PDF descargado');
    } catch {
      this.showToast('error', 'No se pudo generar el PDF');
    } finally {
      this.loading.set(false);
    }
  }

  getEstadoClass(estado: string): string {
    const map: Record<string, string> = {
      firmado:   'bg-emerald-100 text-emerald-700',
      liquidado: 'bg-blue-100 text-blue-700',
      cancelado: 'bg-red-100 text-red-700',
      borrador:  'bg-slate-100 text-slate-600',
    };
    return map[estado] ?? 'bg-slate-100 text-slate-600';
  }

  getPipelineClass(estado: string): string {
    const map: Record<string, string> = {
      aprobada:  'bg-emerald-100 text-emerald-700',
      enviada:   'bg-blue-100 text-blue-700',
      rechazada: 'bg-red-100 text-red-700',
      vencida:   'bg-amber-100 text-amber-700',
      borrador:  'bg-slate-100 text-slate-600',
    };
    return map[estado] ?? 'bg-slate-100 text-slate-600';
  }

  getPipelineBar(row: PipelineRow): number {
    const t = this.pipelineTotal();
    return t > 0 ? Math.round((row.total / t) * 100) : 0;
  }

  private firstOfMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  private today(): string { return new Date().toISOString().split('T')[0]; }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
