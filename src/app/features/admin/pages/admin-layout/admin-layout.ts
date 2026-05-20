import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DrawerModule } from 'primeng/drawer';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { AvatarModule } from 'primeng/avatar';
import { BadgeModule } from 'primeng/badge';
import { AuthService } from '../../../../core/services/auth.service';

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly sidebarCollapsed = signal(false);
  readonly mobileSidebarVisible = signal(false);

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

  readonly navSections: NavSection[] = [
    {
      label: 'General',
      items: [
        { label: 'Dashboard', route: 'dashboard', icon: 'pi-chart-bar' },
        { label: 'Calendario', route: 'calendario', icon: 'pi-calendar' },
      ],
    },
    {
      label: 'Comercial',
      items: [
        { label: 'Clientes', route: 'clientes', icon: 'pi-users' },
        { label: 'Cotizaciones', route: 'cotizaciones', icon: 'pi-file' },
        { label: 'Contratos', route: 'contratos', icon: 'pi-file-edit' },
        { label: 'Reservas', route: 'reservas', icon: 'pi-calendar-plus' },
      ],
    },
    {
      label: 'Operativo',
      items: [
        { label: 'Eventos', route: 'eventos', icon: 'pi-star' },
        { label: 'Inventario', route: 'inventario', icon: 'pi-box' },
        { label: 'Punto de Venta', route: 'punto-de-venta', icon: 'pi-shopping-cart' },
        { label: 'Compras', route: 'compras', icon: 'pi-shopping-bag' },
      ],
    },
    {
      label: 'Administración',
      items: [
        { label: 'Proveedores', route: 'proveedores', icon: 'pi-truck' },
        { label: 'Gastos', route: 'gastos', icon: 'pi-wallet' },
        { label: 'Reportes', route: 'reportes', icon: 'pi-chart-line' },
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

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
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
}
