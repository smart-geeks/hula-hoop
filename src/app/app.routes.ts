import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/pages/home-page/home-page').then((m) => m.HomePage),
  },
  {
    path: 'conocenos',
    loadComponent: () =>
      import('./features/gallery/pages/gallery-page/gallery-page').then(
        (m) => m.GalleryPage,
      ),
  },
  {
    path: 'auth/update-password',
    loadComponent: () =>
      import('./features/auth/pages/update-password/update-password-page').then(
        (m) => m.UpdatePasswordPage,
      ),
  },
  {
    path: 'reservar/fiesta-privada',
    loadComponent: () =>
      import('./features/reservations/pages/private-reservation-page/private-reservation-page').then(
        (m) => m.PrivateReservationPage,
      ),
  },
  {
    path: 'reservar/play-day',
    loadComponent: () =>
      import('./features/reservations/pages/playdate-reservation-page/playdate-reservation-page').then(
        (m) => m.PlaydateReservationPage,
      ),
  },
  {
    path: 'reserva/:accessToken',
    loadComponent: () =>
      import('./features/reservations/pages/reservation-detail-page/reservation-detail-page').then(
        (m) => m.ReservationDetailPage,
      ),
  },
  {
    path: 'mi-cuenta/reservas',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/account/pages/my-reservations-page/my-reservations-page').then(
        (m) => m.MyReservationsPage,
      ),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadChildren: () =>
      import('./features/admin/admin.routes').then((m) => m.adminRoutes),
  },
  {
    path: 'aviso-de-privacidad',
    loadComponent: () =>
      import('./features/legal/privacy-page').then((m) => m.PrivacyPage),
  },
  {
    path: 'terminos-y-condiciones',
    loadComponent: () =>
      import('./features/legal/terms-page').then((m) => m.TermsPage),
  },
];
