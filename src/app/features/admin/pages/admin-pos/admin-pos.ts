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
import { RestaurantItemService } from '../../../../core/services/restaurant-item.service';
import { ExtraService } from '../../../../core/services/extra.service';
import { PosTicketPrintService } from '../../../../core/services/pos-ticket-print.service';
import { VenueService } from '../../../../core/services/venue.service';
import { ReservationService } from '../../../../core/services/reservation.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import type { PosSession, PosSale, CartItem, PaymentMethod, CashierProfile } from '../../../../core/interfaces/pos';
import type { InventoryItem } from '../../../../core/interfaces/inventory';
import type { RestaurantItem } from '../../../../core/interfaces/restaurant-item';
import type { Extra } from '../../../../core/interfaces/extra';
import type { Contract } from '../../../../core/interfaces/contract';
import type { Category } from '../../../../core/interfaces/category';

@Component({
  selector: 'app-admin-pos',
  templateUrl: './admin-pos.html',
  imports: [FormsModule, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPos {
  private readonly posService            = inject(PosService);
  private readonly inventoryService      = inject(InventoryService);
  private readonly restaurantItemService  = inject(RestaurantItemService);
  private readonly extraService           = inject(ExtraService);
  private readonly contractService       = inject(ContractService);
  private readonly cashierService        = inject(CashierService);
  private readonly categoryService       = inject(CategoryService);
  private readonly ticketPrint           = inject(PosTicketPrintService);
  private readonly venueService          = inject(VenueService);
  private readonly reservationService    = inject(ReservationService);
  private readonly supabase              = inject(SupabaseService);

  // ── Core data ─────────────────────────────────────────────
  readonly loading        = signal(true);
  readonly processing     = signal(false);
  readonly activeSession  = signal<PosSession | null>(null);
  readonly salesHistory   = signal<PosSale[]>([]);
  readonly inventory      = signal<InventoryItem[]>([]);
  readonly restaurantItems = signal<RestaurantItem[]>([]);
  readonly extras          = signal<Extra[]>([]);
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

  // ── Imputación (cost center) ───────────────────────────────
  readonly scopeType          = signal<'libre' | 'contrato' | 'playdate'>('libre');
  readonly scopeContractId    = signal<string | null>(null);
  readonly activeTimeSlotId   = signal<string | null>(null);
  readonly timeSlots          = signal<{ id: string; start_time: string; end_time: string }[]>([]);
  readonly checkingCapacity   = signal(false);

  get scopeContractIdBinding(): string { return this.scopeContractId() ?? ''; }
  set scopeContractIdBinding(v: string) { this.scopeContractId.set(v || null); }

  get activeTimeSlotIdBinding(): string { return this.activeTimeSlotId() ?? ''; }
  set activeTimeSlotIdBinding(v: string) { this.activeTimeSlotId.set(v || null); }

  // ── Computed ───────────────────────────────────────────────
  readonly filteredProducts = computed(() => {
    const q   = this.searchQuery().toLowerCase().trim();
    const cat = this.categoryFilter();
    
    // 1. Inventario
    const invList = this.inventory()
      .filter((i) => i.precio_venta > 0 && i.stock_actual > 0)
      .map(i => ({
        id: i.id,
        tipo: 'inventario' as const,
        nombre: i.nombre,
        sku: i.sku || null,
        precio: i.precio_venta,
        categoria: i.categoria || 'Otro',
        stock: i.stock_actual,
        unidad: i.unidad || 'pza'
      }));

    // 2. Restaurante
    const restList = this.restaurantItems()
      .map(r => ({
        id: r.id,
        tipo: 'restaurante' as const,
        nombre: r.name,
        sku: null,
        precio: r.price_cents / 100,
        categoria: 'Restaurante - ' + r.category,
        stock: 999,
        unidad: 'serv'
      }));

    // 3. Extras
    const extraList = this.extras()
      .map(e => ({
        id: e.id,
        tipo: 'extra' as const,
        nombre: e.name,
        sku: null,
        precio: e.price_cents / 100,
        categoria: 'Extras',
        stock: 999,
        unidad: 'serv'
      }));

    let list = [...invList, ...restList, ...extraList];
    if (cat !== 'all') list = list.filter((p) => p.categoria === cat);
    if (q) {
      list = list.filter(
        (p) => p.nombre.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q),
      );
    }
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
    const restCats = this.restaurantItems().map((r) => 'Restaurante - ' + r.category);
    const allCats = [...invCats, ...restCats, 'Extras'];
    const extra = allCats.filter((c) => !dbNames.has(c));
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
    const venueId = this.venueService.currentVenueId() || '00000000-0000-0000-0000-000000000001';

    const [sessions, inventory, restaurantItems, extras, contracts, cashiers, productCategories] = await Promise.all([
      this.posService.getActiveSessions(),
      this.inventoryService.getAll(),
      this.restaurantItemService.getActiveItemsByVenue(venueId),
      this.extraService.getActiveExtrasByVenue(venueId),
      this.contractService.getAll(),
      this.cashierService.getActive(),
      this.categoryService.getByTipo('producto'),
    ]);

    // Cargar time_slots activos del venue para el selector de Play Day
    const client = this.supabase.client;
    if (client) {
      const { data: slots } = await client
        .from('time_slots')
        .select('id, start_time, end_time')
        .eq('venue_id', venueId)
        .eq('is_active', true)
        .order('start_time');
      this.timeSlots.set(slots ?? []);
    }

    let sales: PosSale[] = [];
    if (sessions.length > 0) {
      sales = await this.posService.getSalesBySession(sessions[0].id);
    }

    if (sessions.length > 0) {
      this.activeSession.set(sessions[0]);
      this.salesHistory.set(sales);
    }
    this.inventory.set(inventory);
    this.restaurantItems.set(restaurantItems);
    this.extras.set(extras);
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

  async addToCart(prod: { id: string; tipo: 'inventario' | 'restaurante' | 'extra'; nombre: string; sku: string | null; precio: number; stock: number }): Promise<void> {
    // Verificar capacidad si es un producto de acceso (boleto Play Day)
    if (prod.tipo === 'restaurante') {
      const item = this.restaurantItems().find((r) => r.id === prod.id);
      if (item?.category === 'acceso') {
        if (this.scopeType() !== 'playdate' || !this.activeTimeSlotId()) {
          this.showToast('error', 'Selecciona el turno de Play Day activo en el selector de imputación');
          return;
        }
        this.checkingCapacity.set(true);
        const today = new Date().toISOString().split('T')[0];
        const maxCap = 20; // fallback — idealmente de venueConfig
        const available = await this.reservationService.getPlaydateAvailability(today, this.activeTimeSlotId()!, maxCap);
        this.checkingCapacity.set(false);

        const alreadyInCart = this.cart()
          .filter((c) => c.id === prod.id && c.tipo === 'restaurante')
          .reduce((sum, c) => sum + c.cantidad, 0);
        if (available - alreadyInCart <= 0) {
          this.showToast('error', '¡Cupo de Play Day completo para este turno!');
          return;
        }
      }
    }

    const existing = this.cart().find((c) => c.id === prod.id && c.tipo === prod.tipo);
    if (existing) {
      if (existing.cantidad >= prod.stock) return;
      this.cart.update((list) =>
        list.map((c) =>
          c.id === prod.id && c.tipo === prod.tipo
            ? { ...c, cantidad: c.cantidad + 1, subtotal: (c.cantidad + 1) * c.precio_unitario }
            : c,
        ),
      );
    } else {
      this.cart.update((list) => [
        ...list,
        {
          id:              prod.id,
          tipo:            prod.tipo,
          nombre:          prod.nombre,
          sku:             prod.sku,
          cantidad:        1,
          precio_unitario: prod.precio,
          subtotal:        prod.precio,
        },
      ]);
    }
  }

  updateQty(id: string, tipo: 'inventario' | 'restaurante' | 'extra', delta: number): void {
    this.cart.update((list) => {
      const existing = list.find((c) => c.id === id && c.tipo === tipo);
      if (!existing) return list;
      
      const newQty = existing.cantidad + delta;
      if (newQty <= 0) {
        return list.filter((c) => !(c.id === id && c.tipo === tipo));
      }
      
      let stockLimit = 999;
      if (tipo === 'inventario') {
        const inv = this.inventory().find((i) => i.id === id);
        if (inv) stockLimit = inv.stock_actual;
      }
      if (newQty > stockLimit) return list;
      
      return list.map((c) =>
        c.id === id && c.tipo === tipo
          ? { ...c, cantidad: newQty, subtotal: newQty * c.precio_unitario }
          : c
      );
    });
  }

  removeFromCart(id: string, tipo: 'inventario' | 'restaurante' | 'extra'): void {
    this.cart.update((list) => list.filter((c) => !(c.id === id && c.tipo === tipo)));
  }

  clearCart(): void { this.cart.set([]); }

  async checkout(): Promise<void> {
    const session = this.activeSession();
    if (!session || this.cart().length === 0 || this.processing()) return;

    this.processing.set(true);
    const cartSnapshot = this.cart();
    const cashierId    = this.activeCashier()?.id ?? null;

    const sale = await this.posService.registerSale({
      session_id:            session.id,
      cashier_id:            cashierId,
      total:                 this.cartTotal(),
      pagado_con:            this.paymentMethod(),
      contract_id:           this.scopeType() === 'contrato' ? (this.scopeContractId() ?? null) : null,
      playdate_date:         this.scopeType() === 'playdate' ? new Date().toISOString().split('T')[0] : null,
      playdate_time_slot_id: this.scopeType() === 'playdate' ? (this.activeTimeSlotId() ?? null) : null,
      items:                 cartSnapshot.map((c) => ({
        item_id:            c.tipo === 'inventario' ? c.id : null,
        restaurant_item_id: c.tipo === 'restaurante' ? c.id : null,
        extra_id:           c.tipo === 'extra' ? c.id : null,
        cantidad:           c.cantidad,
        precio_unitario:    c.precio_unitario,
      })),
    });

    if (sale) {
      for (const cartItem of cartSnapshot) {
        if (cartItem.tipo === 'inventario') {
          await this.inventoryService.registerMovement({
            item_id:     cartItem.id,
            tipo:        'salida',
            cantidad:    cartItem.cantidad,
            motivo:      `Venta POS ${sale.folio}`,
            contract_id: session.contract_id ?? undefined,
          });
        } else if (cartItem.tipo === 'restaurante') {
          const item = this.restaurantItems().find((r) => r.id === cartItem.id);
          if (item?.category === 'acceso') {
            const today = new Date().toISOString().split('T')[0];
            const slotId = this.activeTimeSlotId()!;
            const venueId = this.venueService.currentVenueId() || '00000000-0000-0000-0000-000000000001';
            
            try {
              await this.reservationService.createPlaydateReservation({
                venue_id:           venueId,
                guest_name:         'Cliente Taquilla',
                guest_email:        'taquilla@hulahoop.com',
                guest_phone:        '0000000000',
                reservation_date:   today,
                time_slot_id:       slotId,
                kids_count:         cartItem.cantidad,
                adults_count:       0,
                extra_adults_count: 0,
                total_cents:        Math.round(cartItem.precio_unitario * 100 * cartItem.cantidad),
                ...({
                  status: 'confirmed',
                  paid_deposit_cents: Math.round(cartItem.precio_unitario * 100 * cartItem.cantidad)
                } as any)
              });
            } catch (resErr) {
              console.error('Error auto-creating playdate reservation in POS checkout:', resErr);
            }
          }
        }
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

  getCartQty(id: string, tipo: 'inventario' | 'restaurante' | 'extra'): number {
    return this.cart().find((c) => c.id === id && c.tipo === tipo)?.cantidad ?? 0;
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
