import { computed, inject, Injectable, signal, effect } from '@angular/core';
import { AuthService } from './auth.service';
import { VenueService } from './venue.service';
import { SupabaseService } from './supabase.service';
import type { DynamicPermissions, RolePermissions } from '../interfaces/permission';

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly auth = inject(AuthService);
  private readonly venueService = inject(VenueService);
  private readonly supabase = inject(SupabaseService);

  readonly currentPermissions = signal<DynamicPermissions | null>(null);
  readonly currentRoleSlug = signal<string | null>(null);
  readonly currentRoleName = signal<string | null>(null);
  readonly loading = signal(false);

  private readonly permissionResolvers: (() => void)[] = [];

  constructor() {
    // Automatically load permissions whenever the current user, profile, or active venue changes
    effect(() => {
      const user = this.auth.currentUser();
      const venueId = this.venueService.currentVenueId();
      const profile = this.auth.userProfile(); // Triggers reloading if profile changes

      if (user && venueId) {
        this.loadPermissions(user.id, venueId);
      } else {
        this.currentPermissions.set(null);
        this.currentRoleSlug.set(null);
        this.currentRoleName.set(null);
        this.resolvePermissions();
      }
    });
  }

  private resolvePermissions(): void {
    this.permissionResolvers.forEach((r) => r());
    this.permissionResolvers.length = 0;
  }

  async awaitReady(): Promise<void> {
    await this.auth.awaitReady();
    if (!this.auth.isLoggedIn()) return;

    if (this.currentPermissions() !== null && !this.loading()) return;

    return new Promise<void>((resolve) => {
      this.permissionResolvers.push(resolve);
    });
  }

  /**
   * Loads user permissions from the dynamic roles table in Supabase.
   * If the roles table or dynamic column is not yet present (migration pending),
   * it falls back gracefully to hardcoded presets based on legacy profile roles.
   */
  private async loadPermissions(userId: string, venueId: string): Promise<void> {
    const client = this.supabase.client;
    if (!client) {
      this.setDefaultFallback();
      this.resolvePermissions();
      return;
    }

    this.loading.set(true);
    try {
      // 1. Owner profile bypasses all queries and gets absolute permissions
      const profile = this.auth.userProfile();
      if (profile?.role === 'owner') {
        this.currentRoleSlug.set('owner');
        this.currentRoleName.set('Dueño / Owner');
        this.currentPermissions.set(this.getMasterPermissions());
        this.loading.set(false);
        return;
      }

      // 2. Query venue_users joined with roles table
      const { data, error } = await client
        .from('venue_users')
        .select(`
          role,
          role_id,
          roles (
            slug,
            nombre,
            permisos
          )
        `)
        .eq('venue_id', venueId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        // Fallback to legacy structure if dynamic tables are missing or not populated yet
        console.warn('[PermissionService] Failed to load dynamic permissions (migration might be pending):', error.message);
        this.setDefaultFallback();
        return;
      }

      if (data && data.roles) {
        const roleData = data.roles as any;
        this.currentRoleSlug.set(roleData.slug || data.role || 'staff');
        this.currentRoleName.set(roleData.nombre || 'Personal Staff');
        this.currentPermissions.set(roleData.permisos as DynamicPermissions);
      } else if (data) {
        // Linked role_id might be null or table empty, use string 'role' column fallback
        this.setLegacyRoleFallback(data.role || 'staff');
      } else {
        this.setDefaultFallback();
      }
    } catch (err) {
      console.error('[PermissionService] Unexpected error loading permissions:', err);
      this.setDefaultFallback();
    } finally {
      this.loading.set(false);
      this.resolvePermissions();
    }
  }

  /** Sets legacy string fallback mapping */
  private setLegacyRoleFallback(role: string): void {
    this.currentRoleSlug.set(role);
    
    switch (role) {
      case 'owner':
      case 'admin':
        this.currentRoleName.set(role === 'owner' ? 'Dueño / Owner' : 'Administrador');
        this.currentPermissions.set(this.getMasterPermissions());
        break;
      case 'manager':
        this.currentRoleName.set('Manager de Sucursal');
        this.currentPermissions.set(this.getPresetPermissions('manager'));
        break;
      case 'socio':
        this.currentRoleName.set('Socio');
        this.currentPermissions.set(this.getPresetPermissions('socio'));
        break;
      case 'cajera':
        this.currentRoleName.set('Cajera / POS');
        this.currentPermissions.set(this.getPresetPermissions('cajera'));
        break;
      case 'staff':
      default:
        this.currentRoleName.set('Personal Staff');
        this.currentPermissions.set(this.getPresetPermissions('staff'));
        break;
    }
  }

  private setDefaultFallback(): void {
    const profile = this.auth.userProfile();
    const role = profile?.role ?? 'staff';
    this.setLegacyRoleFallback(role);
  }

  /**
   * Checks if the active user has a specific permission for a menu module and action.
   * @param menu The menu key (e.g. 'gastos', 'contratos', 'configuracion')
   * @param action The CRUD action: 'c' (create), 'r' (read), 'u' (update), 'd' (delete)
   */
  hasPermission(menu: string, action: 'c' | 'r' | 'u' | 'd'): boolean {
    const slug = this.currentRoleSlug();
    
    // 1. Owner always has absolute bypass access
    if (slug === 'owner') {
      return true;
    }

    const perms = this.currentPermissions();
    if (!perms) {
      return false;
    }

    // 2. Normalize menu naming if needed
    const normalizedMenu = menu.toLowerCase().trim();

    // 3. Extract matrix
    const menuPerms = perms[normalizedMenu];
    if (!menuPerms) {
      return false;
    }

    return !!menuPerms[action];
  }

  /** Simple shorthand to check read access for a menu route */
  hasMenuAccess(menu: string): boolean {
    return this.hasPermission(menu, 'r');
  }

  /** Generates full master permissions for Owner / Admin */
  private getMasterPermissions(): DynamicPermissions {
    const modules = this.getAllModuleKeys();
    const perms: DynamicPermissions = {};
    for (const m of modules) {
      perms[m] = { c: true, r: true, u: true, d: true };
    }
    return perms;
  }

  /** Retrieves preset structures for standard local fallbacks */
  private getPresetPermissions(role: 'manager' | 'socio' | 'cajera' | 'staff'): DynamicPermissions {
    const allModules = this.getAllModuleKeys();
    const perms: DynamicPermissions = {};
    
    // Fill all with false first
    for (const m of allModules) {
      perms[m] = { c: false, r: false, u: false, d: false };
    }

    if (role === 'manager') {
      for (const m of allModules) {
        if (m === 'configuracion') continue;
        perms[m] = { c: true, r: true, u: true, d: (m !== 'contratos' && m !== 'gastos' && m !== 'compras') };
      }
      perms['reportes'] = { c: false, r: true, u: false, d: false };
    } 
    else if (role === 'socio') {
      for (const m of allModules) {
        if (m === 'configuracion') continue;
        perms[m] = { c: false, r: true, u: false, d: false };
      }
    } 
    else if (role === 'cajera') {
      const allowed = ['hoy', 'reservas', 'clientes', 'inventario'];
      perms['hoy'] = { c: true, r: true, u: true, d: false };
      perms['reservas'] = { c: true, r: true, u: true, d: false };
      perms['clientes'] = { c: true, r: true, u: true, d: false };
      perms['inventario'] = { c: false, r: true, u: false, d: false };
    } 
    else if (role === 'staff') {
      perms['hoy'] = { c: false, r: true, u: false, d: false };
      perms['calendario'] = { c: false, r: true, u: false, d: false };
      perms['reservas'] = { c: false, r: true, u: false, d: false };
      perms['eventos'] = { c: false, r: true, u: false, d: false };
      perms['clientes'] = { c: false, r: true, u: false, d: false };
      perms['inventario'] = { c: false, r: true, u: false, d: false };
    }

    return perms;
  }

  private getAllModuleKeys(): string[] {
    return [
      'hoy', 'calendario', 'reservas', 'eventos', 'clientes', 
      'cotizaciones', 'contratos', 'gastos', 'compras', 
      'inventario', 'proveedores', 'configuracion', 'reportes',
      'paquetes', 'extras', 'meriendas', 'horarios', 'restaurante', 'galeria', 'salones'
    ];
  }
}
