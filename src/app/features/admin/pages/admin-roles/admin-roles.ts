import { ChangeDetectionStrategy, Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { VenueService } from '../../../../core/services/venue.service';
import { PermissionService } from '../../../../core/services/permission.service';
import type { Role, DynamicPermissions } from '../../../../core/interfaces/permission';

@Component({
  selector: 'app-admin-roles',
  templateUrl: './admin-roles.html',
  imports: [
    CommonModule,
    FormsModule,
    ToastModule,
  ],
  providers: [MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminRoles {
  private readonly supabase = inject(SupabaseService);
  private readonly venueService = inject(VenueService);
  private readonly permissionService = inject(PermissionService);
  private readonly messageService = inject(MessageService);

  readonly roles = signal<Role[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);

  // Active Selected Role ID for visual editing
  readonly selectedRoleId = signal<string | null>(null);

  // Computed properties
  readonly selectedRole = computed(() => 
    this.roles().find(r => r.id === this.selectedRoleId()) ?? null
  );

  // Active matrix configuration for the selected role
  readonly activePermissions = signal<DynamicPermissions>({});

  // Dynamic modules list (keys and visual label mappings)
  readonly modules = [
    { key: 'hoy', name: 'Vista Hoy (Dashboard POS)', desc: 'Dashboard de operaciones de caja y accesos rápidos' },
    { key: 'calendario', name: 'Calendario de Eventos', desc: 'Calendario general de fiestas y eventos' },
    { key: 'reservas', name: 'Reservaciones', desc: 'Crear, modificar y cancelar reservas de play dates' },
    { key: 'eventos', name: 'Eventos Privados', desc: 'Gestión de cotizaciones y contratación de fiestas privadas' },
    { key: 'clientes', name: 'Base de Clientes', desc: 'Acceso a datos de contacto y facturación de clientes' },
    { key: 'cotizaciones', name: 'Cotizaciones', desc: 'Envío de presupuestos de fiestas y eventos' },
    { key: 'contratos', name: 'Contratos', desc: 'Ver, formalizar y anular contratos oficiales' },
    { key: 'gastos', name: 'Gastos de Sucursal', desc: 'Registro y control de egresos diarios' },
    { key: 'compras', name: 'Compras y Pedidos', desc: 'Pedidos a proveedores de insumos' },
    { key: 'inventario', name: 'Control de Inventario', desc: 'Stock de productos, golosinas y materias primas' },
    { key: 'proveedores', name: 'Proveedores', desc: 'Directorio y convenios de proveedores comerciales' },
    { key: 'reportes', name: 'Reportes y Analíticas', desc: 'Reportes de ventas, ocupación y ganancias' },
    { key: 'configuracion', name: 'Configuración del Local', desc: 'Límites de aforo, aforos de POS, tickets y hardware' }
  ];

  constructor() {
    // Automatically fetch roles when active venue is set
    effect(() => {
      const venueId = this.venueService.currentVenueId();
      if (venueId) {
        this.fetchRoles();
      }
    });
  }

  async fetchRoles(): Promise<void> {
    const client = this.supabase.client;
    if (!client) return;

    this.loading.set(true);
    try {
      const { data, error } = await client
        .from('roles')
        .select('*')
        .order('es_preset', { ascending: false })
        .order('nombre');

      if (error) {
        console.error('[AdminRoles] Error fetching roles:', error.message);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar los roles de la base de datos.'
        });
        return;
      }

      this.roles.set((data ?? []) as Role[]);
      
      // Auto-select first role (or manager if exists)
      if (data && data.length > 0) {
        const defaultRole = data.find(r => r.slug === 'manager') ?? data[0];
        this.selectRole(defaultRole.id);
      }
    } catch (err) {
      console.error('[AdminRoles] Unexpected error:', err);
    } finally {
      this.loading.set(false);
    }
  }

  selectRole(roleId: string): void {
    this.selectedRoleId.set(roleId);
    const role = this.selectedRole();
    if (role) {
      // Deep copy permissions block to prevent side effects before saving
      const perms = JSON.parse(JSON.stringify(role.permisos || {}));
      
      // Ensure all modules are represented in the local edit matrix
      const filledPerms: DynamicPermissions = {};
      for (const m of this.modules) {
        filledPerms[m.key] = perms[m.key] || { c: false, r: false, u: false, d: false };
      }
      this.activePermissions.set(filledPerms);
    }
  }

  togglePermission(moduleKey: string, action: 'c' | 'r' | 'u' | 'd'): void {
    const role = this.selectedRole();
    if (!role) return;

    // Owner preset cannot be edited - absolute safety
    if (role.slug === 'owner') {
      this.messageService.add({
        severity: 'warn',
        summary: 'Rol Bloqueado',
        detail: 'El rol de Dueño/Owner tiene acceso total de seguridad que no puede ser alterado.'
      });
      return;
    }

    const current = this.activePermissions();
    const modulePerms = { ...current[moduleKey] };
    modulePerms[action] = !modulePerms[action];

    // Business Logic Rule: If they get any CRUD action, they must have Read ('r') active!
    if (action !== 'r' && modulePerms[action] && !modulePerms['r']) {
      modulePerms['r'] = true;
    }

    // Business Logic Rule: If they lose Read ('r'), they lose all CRUD permissions for that module!
    if (action === 'r' && !modulePerms['r']) {
      modulePerms['c'] = false;
      modulePerms['u'] = false;
      modulePerms['d'] = false;
    }

    this.activePermissions.update(prev => ({
      ...prev,
      [moduleKey]: modulePerms
    }));
  }

  async savePermissions(): Promise<void> {
    const role = this.selectedRole();
    if (!role) return;

    if (role.slug === 'owner') {
      return;
    }

    const client = this.supabase.client;
    if (!client) return;

    this.saving.set(true);
    try {
      const { error } = await client
        .from('roles')
        .update({ permisos: this.activePermissions() })
        .eq('id', role.id);

      if (error) {
        console.error('[AdminRoles] Error updating permissions:', error.message);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Error al actualizar los permisos: ' + error.message
        });
        return;
      }

      this.messageService.add({
        severity: 'success',
        summary: 'Matriz Guardada',
        detail: `Los permisos para el rol "${role.nombre}" se actualizaron con éxito.`
      });

      // Update local state list
      this.roles.update(list => 
        list.map(r => r.id === role.id ? { ...r, permisos: this.activePermissions() } : r)
      );

      // Force reload in permission service dynamically
      // Since effect evaluates signals, updating roles dynamically propagates changes.
    } catch (err) {
      console.error('[AdminRoles] Unexpected error saving:', err);
    } finally {
      this.saving.set(false);
    }
  }
}
