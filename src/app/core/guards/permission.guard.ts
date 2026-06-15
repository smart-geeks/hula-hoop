import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { PermissionService } from '../services/permission.service';

export const permissionGuard: CanActivateFn = async (route, state) => {
  const permissionService = inject(PermissionService);
  const router = inject(Router);

  // Wait for permissions initialization
  await permissionService.awaitReady();

  // Retrieve route metadata configuration
  // Route config should specify e.g.: data: { permission: 'gastos:r' } or data: { permission: 'configuracion' }
  const permissionReq = route.data['permission'] as string | undefined;

  if (!permissionReq) {
    return true; // No permissions specified, permit access
  }

  let menu = permissionReq;
  let action: 'c' | 'r' | 'u' | 'd' = 'r';

  if (permissionReq.includes(':')) {
    const [m, a] = permissionReq.split(':');
    menu = m.trim();
    const act = a.toLowerCase().trim();
    if (act.startsWith('c')) action = 'c';
    else if (act.startsWith('u') || act === 'editar') action = 'u';
    else if (act.startsWith('d') || act === 'eliminar') action = 'd';
    else action = 'r';
  }

  const hasAccess = permissionService.hasPermission(menu, action);

  if (hasAccess) {
    return true;
  }

  console.warn(`[PermissionGuard] Access denied to ${state.url}. Required: ${permissionReq}`);
  return router.createUrlTree(['/admin/denegado']);
};
