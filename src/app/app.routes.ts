import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/pages/home-page/home-page').then((m) => m.HomePage),
  },
  {
    path: 'auth/update-password',
    loadComponent: () =>
      import('./features/auth/pages/update-password/update-password-page').then(
        (m) => m.UpdatePasswordPage,
      ),
  },
];
