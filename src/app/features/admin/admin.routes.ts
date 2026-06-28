import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/admin-layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      {
        path: '',
        redirectTo: 'hoy',
        pathMatch: 'full',
      },

      // ── GENERAL ──────────────────────────────────────────────
      {
        path: 'hoy',
        loadComponent: () =>
          import('./pages/admin-today/admin-today').then((m) => m.AdminToday),
        canActivate: [permissionGuard],
        data: { permission: 'hoy:r' }
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/admin-dashboard/admin-dashboard').then((m) => m.AdminDashboard),
        canActivate: [permissionGuard],
        data: { permission: 'hoy:r' }
      },
      {
        path: 'calendario',
        loadComponent: () =>
          import('./pages/admin-calendar/admin-calendar').then((m) => m.AdminCalendar),
        canActivate: [permissionGuard],
        data: { permission: 'calendario:r' }
      },

      // ── COMERCIAL ────────────────────────────────────────────
      {
        path: 'clientes',
        loadComponent: () =>
          import('./pages/admin-clients/admin-clients').then((m) => m.AdminClients),
        canActivate: [permissionGuard],
        data: { permission: 'clientes:r' }
      },
      {
        path: 'cotizaciones/nueva',
        loadComponent: () =>
          import('./pages/admin-quote-wizard/admin-quote-wizard').then((m) => m.AdminQuoteWizard),
        canActivate: [permissionGuard],
        data: { permission: 'cotizaciones:r' }
      },
      {
        path: 'cotizaciones/:id/editar',
        loadComponent: () =>
          import('./pages/admin-quote-wizard/admin-quote-wizard').then((m) => m.AdminQuoteWizard),
        canActivate: [permissionGuard],
        data: { permission: 'cotizaciones:r' }
      },
      {
        path: 'cotizaciones',
        loadComponent: () =>
          import('./pages/admin-quotes/admin-quotes').then((m) => m.AdminQuotes),
        canActivate: [permissionGuard],
        data: { permission: 'cotizaciones:r' }
      },
      {
        path: 'contratos',
        loadComponent: () =>
          import('./pages/admin-contracts/admin-contracts').then((m) => m.AdminContracts),
        canActivate: [permissionGuard],
        data: { permission: 'contratos:r' }
      },
      {
        path: 'reservas',
        loadComponent: () =>
          import('./pages/admin-reservations/admin-reservations').then(
            (m) => m.AdminReservations,
          ),
        canActivate: [permissionGuard],
        data: { permission: 'reservas:r' }
      },

      {
        path: 'evento/:id',
        loadComponent: () =>
          import('./pages/admin-event-detail/admin-event-detail').then(
            (m) => m.AdminEventDetail,
          ),
        canActivate: [permissionGuard],
        data: { permission: 'eventos:r' }
      },
      {
        path: 'evento/:id/checklist',
        loadComponent: () =>
          import('./pages/admin-event-checklist/admin-event-checklist').then(
            (m) => m.AdminEventChecklist,
          ),
        canActivate: [permissionGuard],
        data: { permission: 'eventos:r' }
      },

      // ── OPERATIVO ────────────────────────────────────────────
      {
        path: 'eventos',
        loadComponent: () =>
          import('./pages/admin-events/admin-events').then((m) => m.AdminEvents),
        canActivate: [permissionGuard],
        data: { permission: 'eventos:r' }
      },
      {
        path: 'inventario',
        loadComponent: () =>
          import('./pages/admin-inventory/admin-inventory').then((m) => m.AdminInventory),
        canActivate: [permissionGuard],
        data: { permission: 'inventario:r' }
      },
      {
        path: 'punto-de-venta',
        loadComponent: () =>
          import('./pages/admin-pos/admin-pos').then((m) => m.AdminPos),
        canActivate: [permissionGuard],
        data: { permission: 'hoy:r' } // standard POS access
      },
      {
        path: 'compras',
        loadComponent: () =>
          import('./pages/admin-purchases/admin-purchases').then((m) => m.AdminPurchases),
        canActivate: [permissionGuard],
        data: { permission: 'compras:r' }
      },

      // ── ADMINISTRACIÓN ───────────────────────────────────────
      {
        path: 'proveedores',
        loadComponent: () =>
          import('./pages/admin-suppliers/admin-suppliers').then((m) => m.AdminSuppliers),
        canActivate: [permissionGuard],
        data: { permission: 'proveedores:r' }
      },
      {
        path: 'gastos',
        loadComponent: () =>
          import('./pages/admin-expenses/admin-expenses').then((m) => m.AdminExpenses),
        canActivate: [permissionGuard],
        data: { permission: 'gastos:r' }
      },
      {
        path: 'reportes',
        loadComponent: () =>
          import('./pages/admin-reports/admin-reports').then((m) => m.AdminReports),
        canActivate: [permissionGuard],
        data: { permission: 'reportes:r' }
      },

      // ── CATÁLOGOS (existentes, se conservan) ─────────────────
      {
        path: 'paquetes',
        loadComponent: () =>
          import('./pages/admin-packages/admin-packages').then((m) => m.AdminPackages),
        canActivate: [permissionGuard],
        data: { permission: 'paquetes:r' }
      },
      {
        path: 'experiencias',
        loadComponent: () =>
          import('./pages/admin-experiences/admin-experiences').then((m) => m.AdminExperiences),
        canActivate: [permissionGuard],
        data: { permission: 'paquetes:r' }
      },
      {
        path: 'extras',
        loadComponent: () =>
          import('./pages/admin-extras/admin-extras').then((m) => m.AdminExtras),
        canActivate: [permissionGuard],
        data: { permission: 'extras:r' }
      },
      {
        path: 'meriendas',
        loadComponent: () =>
          import('./pages/admin-snacks/admin-snacks').then((m) => m.AdminSnacks),
        canActivate: [permissionGuard],
        data: { permission: 'meriendas:r' }
      },
      {
        path: 'horarios',
        loadComponent: () =>
          import('./pages/admin-time-slots/admin-time-slots').then(
            (m) => m.AdminTimeSlots,
          ),
        canActivate: [permissionGuard],
        data: { permission: 'horarios:r' }
      },
      {
        path: 'restaurante',
        loadComponent: () =>
          import('./pages/admin-restaurant/admin-restaurant').then(
            (m) => m.AdminRestaurant,
          ),
        canActivate: [permissionGuard],
        data: { permission: 'restaurante:r' }
      },
      {
        path: 'galeria',
        loadComponent: () =>
          import('./pages/admin-gallery/admin-gallery').then((m) => m.AdminGallery),
        canActivate: [permissionGuard],
        data: { permission: 'galeria:r' }
      },
      {
        path: 'configuracion',
        loadComponent: () =>
          import('./pages/admin-config/admin-config').then((m) => m.AdminConfig),
        canActivate: [permissionGuard],
        data: { permission: 'configuracion:r' }
      },
      {
        path: 'salones',
        loadComponent: () =>
          import('./pages/admin-venues/admin-venues').then((m) => m.AdminVenues),
        canActivate: [permissionGuard],
        data: { permission: 'salones:r' }
      },
      {
        path: 'roles',
        loadComponent: () =>
          import('./pages/admin-roles/admin-roles').then((m) => m.AdminRoles),
        canActivate: [permissionGuard],
        data: { permission: 'configuracion:r' }
      },
      {
        path: 'denegado',
        loadComponent: () =>
          import('./pages/admin-denegado/admin-denegado').then((m) => m.AdminDenegado),
      },
    ],
  },
];

