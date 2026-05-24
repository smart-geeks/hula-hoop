import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  NgZone,
  OnDestroy,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DrawerModule } from 'primeng/drawer';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { AvatarModule } from 'primeng/avatar';
import { BadgeModule } from 'primeng/badge';
import { AuthService } from '../../../../core/services/auth.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { VenueService } from '../../../../core/services/venue.service';
import { GlobalSearch } from '../../components/global-search/global-search';
import { VenueSwitcher } from '../../components/venue-switcher/venue-switcher';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface NavItem {
  label: string;
  route: string;
  icon: string;
  badge?: number;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

@Component({
  selector: 'app-admin-layout',
  templateUrl: './admin-layout.html',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    DrawerModule,
    ButtonModule,
    TooltipModule,
    AvatarModule,
    BadgeModule,
    GlobalSearch,
    VenueSwitcher,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayout implements OnDestroy {
  private readonly ngZone = inject(NgZone);
  private readonly auth = inject(AuthService);
  readonly venueService = inject(VenueService);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private realtimeChannel: RealtimeChannel | null = null;
  private notifTimer: ReturnType<typeof setTimeout> | null = null;

  readonly sidebarCollapsed = signal(false);
  readonly mobileSidebarVisible = signal(false);
  readonly fabOpen = signal(false);

  // ── Realtime notification ──────────────────────────────────
  readonly newReservationNotif = signal<{ name: string; type: string } | null>(null);
  readonly notifVisible = signal(false);

  readonly userProfile = this.auth.userProfile;
  readonly isOwner = this.auth.isOwner;
  readonly canManage = this.auth.canManage;

  readonly userInitials = computed(() => {
    const name = this.userProfile()?.full_name ?? '';
    return name
      .split(' ')
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  });

  // ── Navigation (task-oriented grouping) ───────────────────
  readonly ownerNavSection: NavSection = {
    label: 'Administración',
    items: [
      { label: 'Salones', route: 'salones', icon: 'pi-building' },
    ],
  };

  readonly navSections: NavSection[] = [
    {
      label: 'Operaciones',
      items: [
        { label: 'Hoy', route: 'hoy', icon: 'pi-sun' },
        { label: 'Calendario', route: 'calendario', icon: 'pi-calendar' },
        { label: 'Reservas', route: 'reservas', icon: 'pi-calendar-plus' },
        { label: 'Eventos', route: 'eventos', icon: 'pi-star' },
      ],
    },
    {
      label: 'Comercial',
      items: [
        { label: 'Clientes', route: 'clientes', icon: 'pi-users' },
        { label: 'Cotizaciones', route: 'cotizaciones', icon: 'pi-file' },
        { label: 'Contratos', route: 'contratos', icon: 'pi-file-edit' },
      ],
    },
    {
      label: 'Finanzas',
      items: [
        { label: 'Gastos', route: 'gastos', icon: 'pi-wallet' },
        { label: 'Compras', route: 'compras', icon: 'pi-shopping-bag' },
        { label: 'Punto de Venta', route: 'punto-de-venta', icon: 'pi-shopping-cart' },
        { label: 'Reportes', route: 'reportes', icon: 'pi-chart-line' },
      ],
    },
    {
      label: 'Bodega',
      items: [
        { label: 'Inventario', route: 'inventario', icon: 'pi-box' },
        { label: 'Proveedores', route: 'proveedores', icon: 'pi-truck' },
      ],
    },
    {
      label: 'Catálogos',
      items: [
        { label: 'Paquetes', route: 'paquetes', icon: 'pi-gift' },
        { label: 'Extras', route: 'extras', icon: 'pi-plus-circle' },
        { label: 'Meriendas', route: 'meriendas', icon: 'pi-apple' },
        { label: 'Horarios', route: 'horarios', icon: 'pi-clock' },
        { label: 'Restaurante', route: 'restaurante', icon: 'pi-utensils' },
        { label: 'Galería', route: 'galeria', icon: 'pi-images' },
      ],
    },
  ];

  constructor() {
    this.subscribeToRealtime();

    // Cmd+K / Ctrl+K opens global search (delegated to GlobalSearch component)
    const handler = (e: KeyboardEvent) => {
      // Handled by GlobalSearch component — this is just a placeholder
      // for any layout-level keyboard shortcuts
      if (e.key === 'Escape') {
        this.fabOpen.set(false);
      }
    };
    this.doc.addEventListener('keydown', handler);
    this.destroyRef.onDestroy(() => this.doc.removeEventListener('keydown', handler));
  }

  private subscribeToRealtime(): void {
    const client = this.supabase.client;
    if (!client) return;

    this.realtimeChannel = client
      .channel('admin-new-reservations')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'private_reservations' },
        (payload) => {
          const data = payload.new as { guest_name: string };
          this.showNotification(data.guest_name, 'Fiesta Privada');
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'playdate_reservations' },
        (payload) => {
          const data = payload.new as { guest_name: string };
          this.showNotification(data.guest_name, 'Play Day');
        },
      )
      .subscribe();
  }

  private showNotification(name: string, type: string): void {
    this.ngZone.run(() => {
      this.newReservationNotif.set({ name, type });
      this.notifVisible.set(true);
      if (this.notifTimer) clearTimeout(this.notifTimer);
      this.notifTimer = setTimeout(() => this.ngZone.run(() => this.notifVisible.set(false)), 7000);
    });
  }

  dismissNotif(): void {
    this.notifVisible.set(false);
    if (this.notifTimer) {
      clearTimeout(this.notifTimer);
      this.notifTimer = null;
    }
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  toggleFab(): void {
    this.fabOpen.update((v) => !v);
  }

  openMobileSidebar(): void {
    this.mobileSidebarVisible.set(true);
  }

  closeMobileSidebar(): void {
    this.mobileSidebarVisible.set(false);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/']);
  }

  ngOnDestroy(): void {
    if (this.realtimeChannel) {
      this.supabase.client?.removeChannel(this.realtimeChannel);
    }
    if (this.notifTimer) clearTimeout(this.notifTimer);
  }
}
