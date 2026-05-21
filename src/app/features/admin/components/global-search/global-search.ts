import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { GlobalSearchService } from '../../../../core/services/global-search.service';
import type {
  ClientResult,
  ContractResult,
  ReservationResult,
  SearchResults,
} from '../../../../core/services/global-search.service';

type ResultType = 'reservation' | 'contract' | 'client';

interface FlatResult {
  type: ResultType;
  label: string;
  sub: string;
  route: string;
  icon: string;
  iconBg: string;
  raw: ReservationResult | ContractResult | ClientResult;
}

@Component({
  selector: 'app-global-search',
  templateUrl: './global-search.html',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalSearch {
  private readonly searchService = inject(GlobalSearchService);
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  readonly isOpen = signal(false);
  readonly query = signal('');
  readonly results = signal<SearchResults | null>(null);
  readonly searching = signal(false);
  readonly selectedIndex = signal(-1);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly flatResults = computed<FlatResult[]>(() => {
    const r = this.results();
    if (!r) return [];
    const items: FlatResult[] = [];
    for (const res of r.reservations) {
      items.push({
        type: 'reservation',
        label: res.guest_name,
        sub: `Reserva · ${this.formatDate(res.reservation_date)}`,
        route: '/admin/reservas',
        icon: 'pi-calendar-plus',
        iconBg: 'bg-violet-100 text-violet-600',
        raw: res,
      });
    }
    for (const c of r.contracts) {
      items.push({
        type: 'contract',
        label: c.client?.nombre ?? c.folio,
        sub: `Contrato ${c.folio} · ${this.formatDate(c.fecha_evento)}`,
        route: '/admin/contratos',
        icon: 'pi-file-edit',
        iconBg: 'bg-blue-100 text-blue-600',
        raw: c,
      });
    }
    for (const cl of r.clients) {
      items.push({
        type: 'client',
        label: cl.nombre,
        sub: cl.email || cl.telefono || 'Cliente',
        route: '/admin/clientes',
        icon: 'pi-user',
        iconBg: 'bg-emerald-100 text-emerald-600',
        raw: cl,
      });
    }
    return items;
  });

  readonly totalResults = computed(() => this.flatResults().length);
  readonly hasResults = computed(() => this.totalResults() > 0);
  readonly showEmpty = computed(
    () => !this.searching() && this.query().length >= 2 && !this.hasResults(),
  );

  constructor() {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.open();
      }
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    };
    this.doc.addEventListener('keydown', handler);
    this.destroyRef.onDestroy(() => {
      this.doc.removeEventListener('keydown', handler);
      if (this.searchTimer) clearTimeout(this.searchTimer);
    });
  }

  open(): void {
    this.isOpen.set(true);
    this.query.set('');
    this.results.set(null);
    this.selectedIndex.set(-1);
    setTimeout(() => (this.doc.getElementById('gs-input') as HTMLInputElement)?.focus(), 50);
  }

  close(): void {
    this.isOpen.set(false);
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  onQueryInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.selectedIndex.set(-1);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (value.trim().length < 2) {
      this.results.set(null);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.searchTimer = setTimeout(async () => {
      const r = await this.searchService.search(value);
      this.results.set(r);
      this.searching.set(false);
    }, 280);
  }

  onKeydown(event: KeyboardEvent): void {
    const total = this.totalResults();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedIndex.update((i) => (i + 1) % total);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedIndex.update((i) => (i <= 0 ? total - 1 : i - 1));
    } else if (event.key === 'Enter') {
      const idx = this.selectedIndex();
      const item = this.flatResults()[idx];
      if (item) this.navigate(item);
    }
  }

  navigate(item: FlatResult): void {
    this.close();
    this.router.navigate([item.route]);
  }

  private formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
