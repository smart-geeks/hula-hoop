import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { PosService } from '../../../../core/services/pos.service';
import { InventoryService } from '../../../../core/services/inventory.service';
import { ContractService } from '../../../../core/services/contract.service';
import type { PosSession, PosSale, CartItem, PaymentMethod } from '../../../../core/interfaces/pos';
import type { InventoryItem } from '../../../../core/interfaces/inventory';
import type { Contract } from '../../../../core/interfaces/contract';

@Component({
  selector: 'app-admin-pos',
  templateUrl: './admin-pos.html',
  imports: [FormsModule, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPos {
  private readonly posService       = inject(PosService);
  private readonly inventoryService = inject(InventoryService);
  private readonly contractService  = inject(ContractService);

  readonly loading       = signal(true);
  readonly processing    = signal(false);
  readonly activeSession = signal<PosSession | null>(null);
  readonly salesHistory  = signal<PosSale[]>([]);
  readonly inventory     = signal<InventoryItem[]>([]);
  readonly contracts     = signal<Contract[]>([]);
  readonly cart          = signal<CartItem[]>([]);
  readonly searchQuery   = signal('');
  readonly paymentMethod = signal<PaymentMethod>('efectivo');
  readonly categoryFilter = signal('all');
  readonly toast         = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  readonly selectedContractId = signal('');
  readonly showNewSession     = signal(false);

  readonly filteredInventory = computed(() => {
    const q   = this.searchQuery().toLowerCase().trim();
    const cat = this.categoryFilter();
    let list  = this.inventory().filter((i) => i.precio_venta > 0 && i.stock_actual > 0);
    if (cat !== 'all') list = list.filter((i) => i.categoria === cat);
    if (q) list = list.filter(
      (i) => i.nombre.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q),
    );
    return list;
  });

  readonly cartTotal = computed(() =>
    this.cart().reduce((s, item) => s + item.subtotal, 0),
  );

  readonly cartItemCount = computed(() =>
    this.cart().reduce((s, item) => s + item.cantidad, 0),
  );

  readonly sessionTotal = computed(() =>
    this.salesHistory().reduce((s, sale) => s + sale.total, 0),
  );

  readonly categories = computed(() => {
    const cats = new Set(this.inventory().map((i) => i.categoria).filter(Boolean));
    return Array.from(cats) as string[];
  });

  constructor() {
    this.loadAll();
  }

  private async loadAll(): Promise<void> {
    const [sessions, inventory, contracts] = await Promise.all([
      this.posService.getActiveSessions(),
      this.inventoryService.getAll(),
      this.contractService.getAll(),
    ]);

    let sales: PosSale[] = [];
    if (sessions.length > 0) {
      sales = await this.posService.getSalesBySession(sessions[0].id);
    }

    if (sessions.length > 0) {
      this.activeSession.set(sessions[0]);
      this.salesHistory.set(sales);
    }
    this.inventory.set(inventory);
    this.contracts.set(contracts.filter((c) => c.estado !== 'cancelado'));
    this.loading.set(false);
  }

  async openSession(): Promise<void> {
    this.processing.set(true);
    const contractId = this.selectedContractId() || undefined;
    const session = await this.posService.openSession(contractId);
    if (session) {
      this.activeSession.set(session);
      this.salesHistory.set([]);
      this.showNewSession.set(false);
      this.showToast('success', 'Sesión de venta iniciada');
    } else {
      this.showToast('error', 'No se pudo iniciar la sesión');
    }
    this.processing.set(false);
  }

  async closeSession(): Promise<void> {
    const session = this.activeSession();
    if (!session) return;
    this.processing.set(true);

    const total = this.salesHistory().reduce((s, sale) => s + sale.total, 0);
    const ok = await this.posService.closeSession(session.id, total);
    if (ok) {
      this.activeSession.set(null);
      this.salesHistory.set([]);
      this.cart.set([]);
      this.showToast('success', `Sesión cerrada — Total vendido: ${this.formatCurrency(total)}`);
    }
    this.processing.set(false);
  }

  addToCart(item: InventoryItem): void {
    const existing = this.cart().find((c) => c.item_id === item.id);
    if (existing) {
      if (existing.cantidad >= item.stock_actual) return;
      this.cart.update((list) =>
        list.map((c) =>
          c.item_id === item.id
            ? { ...c, cantidad: c.cantidad + 1, subtotal: (c.cantidad + 1) * c.precio_unitario }
            : c,
        ),
      );
    } else {
      this.cart.update((list) => [
        ...list,
        {
          item_id:         item.id,
          nombre:          item.nombre,
          sku:             item.sku,
          cantidad:        1,
          precio_unitario: item.precio_venta,
          subtotal:        item.precio_venta,
        },
      ]);
    }
  }

  updateQty(item_id: string, delta: number): void {
    this.cart.update((list) => {
      const inv = this.inventory().find((i) => i.id === item_id);
      return list
        .map((c) => {
          if (c.item_id !== item_id) return c;
          const newQty = c.cantidad + delta;
          if (newQty <= 0) return null;
          if (inv && newQty > inv.stock_actual) return c;
          return { ...c, cantidad: newQty, subtotal: newQty * c.precio_unitario };
        })
        .filter(Boolean) as CartItem[];
    });
  }

  removeFromCart(item_id: string): void {
    this.cart.update((list) => list.filter((c) => c.item_id !== item_id));
  }

  clearCart(): void { this.cart.set([]); }

  async checkout(): Promise<void> {
    const session = this.activeSession();
    if (!session || this.cart().length === 0 || this.processing()) return;

    this.processing.set(true);
    const cartSnapshot = this.cart();

    const sale = await this.posService.registerSale({
      session_id: session.id,
      total:      this.cartTotal(),
      pagado_con: this.paymentMethod(),
      items:      cartSnapshot.map((c) => ({
        item_id:         c.item_id,
        cantidad:        c.cantidad,
        precio_unitario: c.precio_unitario,
      })),
    });

    if (sale) {
      for (const cartItem of cartSnapshot) {
        await this.inventoryService.registerMovement({
          item_id:     cartItem.item_id,
          tipo:        'salida',
          cantidad:    cartItem.cantidad,
          motivo:      `Venta POS ${sale.folio}`,
          contract_id: session.contract_id ?? undefined,
        });
      }
      const updatedInventory = await this.inventoryService.getAll();
      this.inventory.set(updatedInventory);
      this.salesHistory.update((list) => [sale, ...list]);
      this.cart.set([]);
      this.showToast('success', `Venta registrada — ${this.formatCurrency(sale.total)}`);
    } else {
      this.showToast('error', 'No se pudo procesar la venta');
    }
    this.processing.set(false);
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  getCartQty(item_id: string): number {
    return this.cart().find((c) => c.item_id === item_id)?.cantidad ?? 0;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
    }).format(value);
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
