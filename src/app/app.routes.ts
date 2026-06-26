import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { rootRedirectGuard } from './core/guards/root-redirect.guard';
import { venueExistsGuard } from './core/guards/venue-exists.guard';

export const routes: Routes = [
  // ── 1. Admin y autenticación ──────────────────────────────────────────────
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadChildren: () =>
      import('./features/admin/admin.routes').then(m => m.adminRoutes),
  },
  {
    path: 'auth/update-password',
    loadComponent: () =>
      import('./features/auth/pages/update-password/update-password-page')
        .then(m => m.UpdatePasswordPage),
  },

  // ── 2. Rutas públicas fijas (DEBEN ir ANTES de :venue_slug) ──────────────
  {
    path: 'mi-cuenta/reservas',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/account/pages/my-reservations-page/my-reservations-page')
        .then(m => m.MyReservationsPage),
  },
  {
    path: 'reserva/:token',
    loadComponent: () =>
      import('./features/reservations/pages/playdate-confirmation-page/playdate-confirmation-page')
        .then(m => m.PlaydateConfirmationPage),
  },
  {
    path: 'cotizacion/:token',
    loadComponent: () =>
      import('./features/quotes/pages/quote-public-page/quote-public-page')
        .then(m => m.QuotePublicPage),
  },
  {
    path: 'contrato/:id',
    loadComponent: () =>
      import('./features/contracts/pages/contract-public-page/contract-public-page')
        .then(m => m.ContractPublicPage),
  },

  {
    path: 'aviso-de-privacidad',
    loadComponent: () =>
      import('./features/legal/privacy-page').then(m => m.PrivacyPage),
  },
  {
    path: 'terminos-y-condiciones',
    loadComponent: () =>
      import('./features/legal/terms-page').then(m => m.TermsPage),
  },

  // ── 3. Redirect de compatibilidad SEO (/conocenos legacy) ────────────────
  {
    path: 'conocenos',
    redirectTo: '/salon-principal/conocenos',
    pathMatch: 'full',
  },

  // ── 4. Raíz: selector de sucursal o redirect vía cookie ──────────────────
  {
    path: '',
    canActivate: [rootRedirectGuard],
    loadComponent: () =>
      import('./features/home/pages/venue-selector/venue-selector')
        .then(m => m.VenueSelectorPage),
  },

  // ── 5. CATCH-ALL: landing dinámica por sucursal ──────────────────────────
  {
    path: ':venue_slug',
    canActivate: [venueExistsGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/home/pages/home-page/home-page')
            .then(m => m.HomePage),
      },
      {
        path: 'conocenos',
        loadComponent: () =>
          import('./features/gallery/pages/gallery-page/gallery-page')
            .then(m => m.GalleryPage),
      },
      {
        path: 'reservar/fiesta-privada',
        loadComponent: () =>
          import('./features/reservations/pages/private-reservation-page/private-reservation-page')
            .then(m => m.PrivateReservationPage),
      },
      {
        path: 'reservar/play-day',
        loadComponent: () =>
          import('./features/reservations/pages/playdate-reservation-page/playdate-reservation-page')
            .then(m => m.PlaydateReservationPage),
      },
    ],
  },
];
