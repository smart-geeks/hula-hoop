import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface EventoRow {
  folio: string;
  cliente: string;
  fecha_evento: string;
  estado: string;
  total_contrato: number;
  deposito_pagado: number;
  saldo_pendiente: number;
}

export interface PLGlobalRow {
  ingresos_contratos: number;
  ventas_pos: number;
  total_ingresos: number;
  compras: number;
  gastos: number;
  total_egresos: number;
  utilidad_neta: number;
}

export interface PipelineRow {
  estado: string;
  cantidad: number;
  total: number;
}

export interface ClienteRow {
  nombre: string;
  email: string;
  telefono: string;
  num_eventos: number;
  total_facturado: number;
  ultimo_evento: string;
}

export interface ProveedorRow {
  nombre: string;
  categoria: string;
  num_compras: number;
  total_compras: number;
  ultima_compra: string;
}

export interface InventarioRow {
  nombre: string;
  sku: string;
  categoria: string;
  unidad: string;
  stock_actual: number;
  stock_minimo: number;
  precio_costo: number;
  precio_venta: number;
  valor_inventario: number;
  alerta: boolean;
}

export interface GastoRow {
  fecha: string;
  categoria: string;
  descripcion: string;
  monto: number;
  evento: string;
  proveedor: string;
}

export interface GastoCategoriaRow {
  categoria: string;
  cantidad: number;
  total: number;
}

export interface FlujoCajaRow {
  fecha: string;
  concepto: string;
  tipo: 'entrada' | 'salida';
  monto: number;
  saldo_acumulado?: number;
}

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly supabase = inject(SupabaseService);

  async getEventos(from: string, to: string, estado?: string): Promise<EventoRow[]> {
    const client = this.supabase.client;
    if (!client) return [];

    let query = client
      .from('contracts')
      .select('folio, fecha_evento, estado, total_contrato, deposito_pagado, saldo_pendiente, client:clients(nombre)')
      .gte('fecha_evento', from)
      .lte('fecha_evento', to)
      .order('fecha_evento', { ascending: true });

    if (estado) query = query.eq('estado', estado);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching eventos report:', error.message);
      return [];
    }

    return (data ?? []).map((r: any) => ({
      folio: r.folio,
      cliente: r.client?.nombre ?? '—',
      fecha_evento: r.fecha_evento,
      estado: r.estado,
      total_contrato: r.total_contrato ?? 0,
      deposito_pagado: r.deposito_pagado ?? 0,
      saldo_pendiente: r.saldo_pendiente ?? 0,
    }));
  }

  async getPLGlobal(from: string, to: string): Promise<PLGlobalRow> {
    const client = this.supabase.client;
    if (!client) return { ingresos_contratos: 0, ventas_pos: 0, total_ingresos: 0, compras: 0, gastos: 0, total_egresos: 0, utilidad_neta: 0 };

    const [paymentsRes, posRes, purchasesRes, expensesRes] = await Promise.all([
      client.from('contract_payments').select('monto').gte('fecha', from).lte('fecha', to),
      client.from('pos_sales').select('total').gte('created_at', from + 'T00:00:00').lte('created_at', to + 'T23:59:59'),
      client.from('purchases').select('total').eq('estado', 'recibida').gte('fecha', from).lte('fecha', to),
      client.from('admin_expenses').select('monto').gte('fecha', from).lte('fecha', to),
    ]);

    const ingresos_contratos = (paymentsRes.data ?? []).reduce((s: number, r: any) => s + (r.monto ?? 0), 0);
    const ventas_pos = (posRes.data ?? []).reduce((s: number, r: any) => s + (r.total ?? 0), 0);
    const compras = (purchasesRes.data ?? []).reduce((s: number, r: any) => s + (r.total ?? 0), 0);
    const gastos = (expensesRes.data ?? []).reduce((s: number, r: any) => s + (r.monto ?? 0), 0);

    const total_ingresos = ingresos_contratos + ventas_pos;
    const total_egresos = compras + gastos;
    const utilidad_neta = total_ingresos - total_egresos;

    return { ingresos_contratos, ventas_pos, total_ingresos, compras, gastos, total_egresos, utilidad_neta };
  }

  async getPipeline(from: string, to: string): Promise<PipelineRow[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('quotes')
      .select('estado, total')
      .gte('fecha', from)
      .lte('fecha', to);

    if (error) {
      console.error('Error fetching pipeline:', error.message);
      return [];
    }

    const map = new Map<string, { cantidad: number; total: number }>();
    for (const r of data ?? []) {
      const s = r.estado as string;
      const cur = map.get(s) ?? { cantidad: 0, total: 0 };
      map.set(s, { cantidad: cur.cantidad + 1, total: cur.total + (r.total ?? 0) });
    }

    const order = ['borrador', 'enviada', 'aprobada', 'rechazada', 'vencida'];
    return order
      .filter((s) => map.has(s))
      .map((s) => ({ estado: s, ...map.get(s)! }));
  }

  async getClientes(from: string, to: string): Promise<ClienteRow[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('contracts')
      .select('total_contrato, fecha_evento, client:clients(nombre, email, telefono)')
      .gte('fecha_evento', from)
      .lte('fecha_evento', to)
      .neq('estado', 'cancelado');

    if (error) {
      console.error('Error fetching clientes report:', error.message);
      return [];
    }

    const map = new Map<string, ClienteRow>();
    for (const r of data ?? []) {
      const c = (r as any).client;
      if (!c) continue;
      const key = c.nombre;
      const cur = map.get(key) ?? {
        nombre: c.nombre,
        email: c.email ?? '—',
        telefono: c.telefono ?? '—',
        num_eventos: 0,
        total_facturado: 0,
        ultimo_evento: '',
      };
      cur.num_eventos++;
      cur.total_facturado += (r as any).total_contrato ?? 0;
      if (!cur.ultimo_evento || (r as any).fecha_evento > cur.ultimo_evento) {
        cur.ultimo_evento = (r as any).fecha_evento;
      }
      map.set(key, cur);
    }

    return Array.from(map.values()).sort((a, b) => b.total_facturado - a.total_facturado);
  }

  async getProveedores(from: string, to: string): Promise<ProveedorRow[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('purchases')
      .select('total, fecha, supplier:suppliers(nombre, categoria)')
      .gte('fecha', from)
      .lte('fecha', to);

    if (error) {
      console.error('Error fetching proveedores report:', error.message);
      return [];
    }

    const map = new Map<string, ProveedorRow>();
    for (const r of data ?? []) {
      const s = (r as any).supplier;
      if (!s) continue;
      const key = s.nombre;
      const cur = map.get(key) ?? {
        nombre: s.nombre,
        categoria: s.categoria ?? '—',
        num_compras: 0,
        total_compras: 0,
        ultima_compra: '',
      };
      cur.num_compras++;
      cur.total_compras += (r as any).total ?? 0;
      if (!cur.ultima_compra || (r as any).fecha > cur.ultima_compra) {
        cur.ultima_compra = (r as any).fecha;
      }
      map.set(key, cur);
    }

    return Array.from(map.values()).sort((a, b) => b.total_compras - a.total_compras);
  }

  async getInventario(categoria?: string): Promise<InventarioRow[]> {
    const client = this.supabase.client;
    if (!client) return [];

    let query = client.from('inventory_items').select('*').eq('activo', true).order('nombre');
    if (categoria) query = query.eq('categoria', categoria);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching inventario report:', error.message);
      return [];
    }

    return (data ?? []).map((r: any) => ({
      nombre: r.nombre,
      sku: r.sku ?? '—',
      categoria: r.categoria ?? '—',
      unidad: r.unidad,
      stock_actual: r.stock_actual,
      stock_minimo: r.stock_minimo,
      precio_costo: r.precio_costo,
      precio_venta: r.precio_venta,
      valor_inventario: r.stock_actual * r.precio_costo,
      alerta: r.stock_minimo > 0 && r.stock_actual <= r.stock_minimo,
    }));
  }

  async getGastos(from: string, to: string, categoria?: string): Promise<{ rows: GastoRow[]; byCategory: GastoCategoriaRow[] }> {
    const client = this.supabase.client;
    if (!client) return { rows: [], byCategory: [] };

    let query = client
      .from('admin_expenses')
      .select('fecha, categoria, descripcion, monto, contract:contracts(folio), supplier:suppliers(nombre)')
      .gte('fecha', from)
      .lte('fecha', to)
      .order('fecha', { ascending: true });

    if (categoria) query = query.eq('categoria', categoria);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching gastos report:', error.message);
      return { rows: [], byCategory: [] };
    }

    const rows: GastoRow[] = (data ?? []).map((r: any) => ({
      fecha: r.fecha,
      categoria: r.categoria,
      descripcion: r.descripcion,
      monto: r.monto,
      evento: r.contract?.folio ?? '—',
      proveedor: r.supplier?.nombre ?? '—',
    }));

    const catMap = new Map<string, GastoCategoriaRow>();
    for (const r of rows) {
      const cur = catMap.get(r.categoria) ?? { categoria: r.categoria, cantidad: 0, total: 0 };
      cur.cantidad++;
      cur.total += r.monto;
      catMap.set(r.categoria, cur);
    }

    const byCategory = Array.from(catMap.values()).sort((a, b) => b.total - a.total);
    return { rows, byCategory };
  }

  async getFlujoCaja(from: string, to: string): Promise<FlujoCajaRow[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const [paymentsRes, expensesRes, purchasesRes] = await Promise.all([
      client.from('contract_payments')
        .select('fecha, monto, contract:contracts(folio)')
        .gte('fecha', from).lte('fecha', to),
      client.from('admin_expenses')
        .select('fecha, monto, descripcion')
        .gte('fecha', from).lte('fecha', to),
      client.from('purchases')
        .select('fecha, total, folio')
        .eq('estado', 'recibida')
        .gte('fecha', from).lte('fecha', to),
    ]);

    const rows: FlujoCajaRow[] = [];

    for (const r of paymentsRes.data ?? []) {
      rows.push({
        fecha: (r as any).fecha,
        concepto: `Pago contrato ${(r as any).contract?.folio ?? ''}`,
        tipo: 'entrada',
        monto: (r as any).monto,
      });
    }

    for (const r of expensesRes.data ?? []) {
      rows.push({
        fecha: (r as any).fecha,
        concepto: (r as any).descripcion,
        tipo: 'salida',
        monto: (r as any).monto,
      });
    }

    for (const r of purchasesRes.data ?? []) {
      rows.push({
        fecha: (r as any).fecha,
        concepto: `Compra ${(r as any).folio}`,
        tipo: 'salida',
        monto: (r as any).total,
      });
    }

    rows.sort((a, b) => a.fecha.localeCompare(b.fecha));

    let saldo = 0;
    for (const r of rows) {
      saldo += r.tipo === 'entrada' ? r.monto : -r.monto;
      r.saldo_acumulado = saldo;
    }

    return rows;
  }
}
