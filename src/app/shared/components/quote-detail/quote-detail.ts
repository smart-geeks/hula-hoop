import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import type { Quote, QuoteItem } from '../../../core/interfaces/quote';
import type { Contract } from '../../../core/interfaces/contract';

interface ItemGroup {
  label: string;
  items: Array<{ raw: QuoteItem; cleanDesc: string }>;
}

@Component({
  selector: 'app-quote-detail',
  templateUrl: './quote-detail.html',
  imports: [CurrencyPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteDetailComponent {
  readonly quote    = input.required<Quote>();
  readonly contract = input<Contract | null>(null);

  private static readonly STATUS: Record<string, { label: string; cls: string }> = {
    borrador:  { label: 'Borrador',  cls: 'bg-slate-100 text-slate-600' },
    enviada:   { label: 'Enviada',   cls: 'bg-blue-100 text-blue-700' },
    aprobada:  { label: 'Aprobada',  cls: 'bg-emerald-100 text-emerald-700' },
    rechazada: { label: 'Rechazada', cls: 'bg-red-100 text-red-700' },
    vencida:   { label: 'Vencida',   cls: 'bg-amber-100 text-amber-700' },
  };

  readonly statusLabel = computed(() =>
    QuoteDetailComponent.STATUS[this.quote().estado]?.label ?? this.quote().estado
  );
  readonly statusClass = computed(() =>
    QuoteDetailComponent.STATUS[this.quote().estado]?.cls ?? 'bg-slate-100 text-slate-600'
  );

  readonly itemGroups = computed<ItemGroup[]>(() => {
    const items = this.quote().items ?? [];
    if (!items.length) return [];

    const PREFIXES: [string, string][] = [
      ['Merienda:',              'Merienda'],
      ['Upgrade de Decoración:', 'Decoración'],
      ['Actividad Premium:',     'Experiencia'],
      ['Actividad Incluida:',    'Experiencia'],
      ['Área Glam Girls',        'Glam Girls'],
    ];

    const clean = (d: string): string =>
      PREFIXES.reduce((s, [p]) => (s.startsWith(p) ? s.slice(p.length).trim() : s), d);

    const categorize = (d: string): string => {
      for (const [p, c] of PREFIXES) { if (d.startsWith(p)) return c; }
      return '__raw__';
    };

    const map = new Map<string, Array<{ raw: QuoteItem; cleanDesc: string }>>();
    let firstRaw = true;
    for (const item of items) {
      const cat = categorize(item.descripcion);
      const label = cat === '__raw__' ? (firstRaw ? (firstRaw = false, 'Paquete') : 'Extras') : cat;
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push({ raw: item, cleanDesc: clean(item.descripcion) });
    }

    const ORDER = ['Paquete', 'Merienda', 'Decoración', 'Experiencia', 'Glam Girls', 'Extras'];
    return ORDER.filter(k => map.has(k)).map(k => ({ label: k, items: map.get(k)! }));
  });

  readonly saldoContrato = computed(() => {
    const c = this.contract();
    if (!c) return null;
    const paid = (c.payments ?? []).reduce((s, p) => s + p.monto, 0);
    return { paid, saldo: c.total_contrato - paid };
  });

  readonly depositBalance = computed(() => {
    const q = this.quote();
    const dep = q.deposit_amount ?? 0;
    if (dep <= 0) return null;
    return { deposit: dep, balance: q.total - dep };
  });
}
