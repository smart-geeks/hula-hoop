import { Directive, inject, Input, TemplateRef, ViewContainerRef, effect } from '@angular/core';
import { PermissionService } from '../services/permission.service';

@Directive({
  selector: '[appHasPermission]',
  standalone: true
})
export class HasPermissionDirective {
  private readonly permissionService = inject(PermissionService);
  private readonly templateRef = inject(TemplateRef<any>);
  private readonly viewContainer = inject(ViewContainerRef);

  private menu = '';
  private action: 'c' | 'r' | 'u' | 'd' = 'r';
  private hasView = false;

  @Input() set appHasPermission(val: string | null | undefined) {
    if (!val) {
      this.menu = '';
      this.action = 'r';
      this.updateView();
      return;
    }

    // Expected format: 'menu:action' (e.g. 'contratos:crear', 'gastos:d', 'inventario:editar')
    if (val.includes(':')) {
      const [m, a] = val.split(':');
      this.menu = m.trim();
      this.action = this.mapAction(a);
    } else {
      this.menu = val.trim();
      this.action = 'r'; // Default action is read
    }
    this.updateView();
  }

  constructor() {
    // Automatically re-evaluate visibility whenever current permissions change
    effect(() => {
      this.permissionService.currentPermissions();
      this.updateView();
    });
  }

  private mapAction(act: string): 'c' | 'r' | 'u' | 'd' {
    const a = act.toLowerCase().trim();
    if (a.startsWith('c') || a === 'crear' || a === 'create') return 'c';
    if (a.startsWith('r') || a === 'leer' || a === 'read' || a === 'ver') return 'r';
    if (a.startsWith('u') || a === 'editar' || a === 'update' || a === 'actualizar') return 'u';
    if (a.startsWith('d') || a === 'eliminar' || a === 'delete' || a === 'borrar') return 'd';
    return 'r';
  }

  private updateView(): void {
    if (!this.menu) {
      this.showTemplate();
      return;
    }

    const permitted = this.permissionService.hasPermission(this.menu, this.action);

    if (permitted && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!permitted && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }

  private showTemplate(): void {
    if (!this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    }
  }
}
