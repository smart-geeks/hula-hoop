import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/admin-layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      {
        path: '',
        redirectTo: 'reservas',
        pathMatch: 'full',
      },
      {
        path: 'reservas',
        loadComponent: () =>
          import('./pages/admin-reservations/admin-reservations').then(
            (m) => m.AdminReservations,
          ),
      },
      {
        path: 'paquetes',
        loadComponent: () =>
          import('./pages/admin-packages/admin-packages').then(
            (m) => m.AdminPackages,
          ),
      },
      {
        path: 'extras',
        loadComponent: () =>
          import('./pages/admin-extras/admin-extras').then(
            (m) => m.AdminExtras,
          ),
      },
      {
        path: 'horarios',
        loadComponent: () =>
          import('./pages/admin-time-slots/admin-time-slots').then(
            (m) => m.AdminTimeSlots,
          ),
      },
      {
        path: 'configuracion',
        loadComponent: () =>
          import('./pages/admin-config/admin-config').then(
            (m) => m.AdminConfig,
          ),
      },
    ],
  },
];
