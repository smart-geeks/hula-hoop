import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/admin-layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },

      // ── GENERAL ──────────────────────────────────────────────
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/admin-dashboard/admin-dashboard').then((m) => m.AdminDashboard),
      },
      {
        path: 'calendario',
        loadComponent: () =>
          import('./pages/admin-calendar/admin-calendar').then((m) => m.AdminCalendar),
      },

      // ── COMERCIAL ────────────────────────────────────────────
      {
        path: 'clientes',
        loadComponent: () =>
          import('./pages/admin-clients/admin-clients').then((m) => m.AdminClients),
      },
      {
        path: 'cotizaciones',
        loadComponent: () =>
          import('./pages/admin-quotes/admin-quotes').then((m) => m.AdminQuotes),
      },
      {
        path: 'contratos',
        loadComponent: () =>
          import('./pages/admin-contracts/admin-contracts').then((m) => m.AdminContracts),
      },
      {
        path: 'reservas',
        loadComponent: () =>
          import('./pages/admin-reservations/admin-reservations').then(
            (m) => m.AdminReservations,
          ),
      },

      // ── OPERATIVO ────────────────────────────────────────────
      {
        path: 'eventos',
        loadComponent: () =>
          import('./pages/admin-events/admin-events').then((m) => m.AdminEvents),
      },
      {
        path: 'inventario',
        loadComponent: () =>
          import('./pages/admin-inventory/admin-inventory').then((m) => m.AdminInventory),
      },
      {
        path: 'punto-de-venta',
        loadComponent: () =>
          import('./pages/admin-pos/admin-pos').then((m) => m.AdminPos),
      },
      {
        path: 'compras',
        loadComponent: () =>
          import('./pages/admin-purchases/admin-purchases').then((m) => m.AdminPurchases),
      },

      // ── ADMINISTRACIÓN ───────────────────────────────────────
      {
        path: 'proveedores',
        loadComponent: () =>
          import('./pages/admin-suppliers/admin-suppliers').then((m) => m.AdminSuppliers),
      },
      {
        path: 'gastos',
        loadComponent: () =>
          import('./pages/admin-expenses/admin-expenses').then((m) => m.AdminExpenses),
      },
      {
        path: 'reportes',
        loadComponent: () =>
          import('./pages/admin-reports/admin-reports').then((m) => m.AdminReports),
      },

      // ── CATÁLOGOS (existentes, se conservan) ─────────────────
      {
        path: 'paquetes',
        loadComponent: () =>
          import('./pages/admin-packages/admin-packages').then((m) => m.AdminPackages),
      },
      {
        path: 'extras',
        loadComponent: () =>
          import('./pages/admin-extras/admin-extras').then((m) => m.AdminExtras),
      },
      {
        path: 'meriendas',
        loadComponent: () =>
          import('./pages/admin-snacks/admin-snacks').then((m) => m.AdminSnacks),
      },
      {
        path: 'horarios',
        loadComponent: () =>
          import('./pages/admin-time-slots/admin-time-slots').then(
            (m) => m.AdminTimeSlots,
          ),
      },
      {
        path: 'restaurante',
        loadComponent: () =>
          import('./pages/admin-restaurant/admin-restaurant').then(
            (m) => m.AdminRestaurant,
          ),
      },
      {
        path: 'galeria',
        loadComponent: () =>
          import('./pages/admin-gallery/admin-gallery').then((m) => m.AdminGallery),
      },
      {
        path: 'configuracion',
        loadComponent: () =>
          import('./pages/admin-config/admin-config').then((m) => m.AdminConfig),
      },
    ],
  },
];
