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
import { CashierService } from '../../../../core/services/cashier.service';
import { CategoryService } from '../../../../core/services/category.service';
import { PosTicketPrintService } from '../../../../core/services/pos-ticket-print.service';
import type { PosSession, PosSale, CartItem, PaymentMethod, CashierProfile } from '../../../../core/interfaces/pos';
import type { InventoryItem } from '../../../../core/interfaces/inventory';
import type { Contract } from '../../../../core/interfaces/contract';
import type { Category } from '../../../../core/interfaces/category';

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
  private readonly cashierService   = inject(CashierService);
  private readonly categoryService  = inject(CategoryService);
  private readonly ticketPrint      = inject(PosTicketPrintService);

  // ── Core data ─────────────────────────────────────────────
  readonly loading        = signal(true);
  readonly processing     = signal(false);
  readonly activeSession  = signal<PosSession | null>(null);
  readonly salesHistory   = signal<PosSale[]>([]);
  readonly inventory      = signal<InventoryItem[]>([]);
  readonly contracts      = signal<Contract[]>([]);
  readonly cart           = signal<CartItem[]>([]);
  readonly searchQuery    = signal('');
  readonly paymentMethod  = signal<PaymentMethod>('efectivo');
  readonly categoryFilter = signal('all');
  readonly toast          = signal<{ type: 'success' | 'error'; message: string } | null>(null);
  readonly selectedContractId  = signal('');
  readonly showNewSession      = signal(false);
  readonly productCategories   = signal<Category[]>([]);

  // ── Cajero auth ────────────────────────────────────────────
  readonly cashiers        = signal<CashierProfile[]>([]);
  readonly activeCashier   = signal<CashierProfile | null>(null);
  readonly selectedCashier = signal<CashierProfile | null>(null); // en pantalla de PIN
  readonly pinInput        = signal('');
  readonly pinError        = signal(false);
  readonly pinValidating   = signal(false);

  // ── Computed ───────────────────────────────────────────────
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
    const dbNames = new Set(this.productCategories().map((c) => c.nombre));
    const invCats = this.inventory().map((i) => i.categoria).filter(Boolean) as string[];
    // DB categories first, then any inventory categories not in DB
    const extra = invCats.filter((c) => !dbNames.has(c));
    return [...Array.from(dbNames), ...Array.from(new Set(extra))];
  });

  // 4 slots: true = relleno, false = vacío
  readonly pinDots = computed(() => {
    const len = this.pinInput().length;
    return [0, 1, 2, 3].map((i) => i < len);
  });

  constructor() {
    this.loadAll();
  }

  private async loadAll(): Promise<void> {
    const [sessions, inventory, contracts, cashiers, productCategories] = await Promise.all([
      this.posService.getActiveSessions(),
      this.inventoryService.getAll(),
      this.contractService.getAll(),
      this.cashierService.getActive(),
      this.categoryService.getByTipo('producto'),
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
    this.cashiers.set(cashiers);
    this.productCategories.set(productCategories);
    this.loading.set(false);
  }

  // ── Cajero PIN flow ────────────────────────────────────────

  selectCashier(cashier: CashierProfile): void {
    this.selectedCashier.set(cashier);
    this.pinInput.set('');
    this.pinError.set(false);
  }

  backToCashierSelect(): void {
    this.selectedCashier.set(null);
    this.pinInput.set('');
    this.pinError.set(false);
  }

  addPin(digit: string): void {
    if (this.pinInput().length >= 4 || this.pinValidating()) return;
    this.pinInput.update((p) => p + digit);
    this.pinError.set(false);
  }

  removePin(): void {
    if (this.pinValidating()) return;
    this.pinInput.update((p) => p.slice(0, -1));
    this.pinError.set(false);
  }

  async submitPin(): Promise<void> {
    const cashier = this.selectedCashier();
    if (!cashier || this.pinInput().length === 0 || this.pinValidating()) return;

    this.pinValidating.set(true);
    const validated = await this.cashierService.validatePin(cashier.id, this.pinInput());
    this.pinValidating.set(false);

    if (validated) {
      this.activeCashier.set(validated);
      this.selectedCashier.set(null);
      this.pinInput.set('');
      this.pinError.set(false);
    } else {
      this.pinError.set(true);
      this.pinInput.set('');
    }
  }

  changeCashier(): void {
    this.activeCashier.set(null);
    this.selectedCashier.set(null);
    this.pinInput.set('');
    this.pinError.set(false);
    this.showNewSession.set(false);
  }

  getCashierInitial(nombre: string): string {
    return nombre.charAt(0).toUpperCase();
  }

  // ── Sesión ─────────────────────────────────────────────────

  async openSession(): Promise<void> {
    this.processing.set(true);
    const contractId = this.selectedContractId() || undefined;
    const cashierId  = this.activeCashier()?.id;
    const session    = await this.posService.openSession(contractId, cashierId);
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
    const ok    = await this.posService.closeSession(session.id, total);
    if (ok) {
      this.activeSession.set(null);
      this.salesHistory.set([]);
      this.cart.set([]);
      this.showToast('success', `Sesión cerrada — Total: ${this.fmt(total)}`);
    }
    this.processing.set(false);
  }

  // ── Carrito ────────────────────────────────────────────────

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
    const cashierId    = this.activeCashier()?.id ?? null;

    const sale = await this.posService.registerSale({
      session_id: session.id,
      cashier_id: cashierId,
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
      this.showToast('success', `Venta registrada — ${this.fmt(sale.total)}`);
      this.ticketPrint.printSale(sale, cartSnapshot, this.activeCashier()?.nombre ?? null);
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

  private fmt(value: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
    }).format(value);
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
