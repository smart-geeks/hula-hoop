import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'auth/update-password',
    renderMode: RenderMode.Client,
  },
  {
    path: 'reserva/:accessToken',
    renderMode: RenderMode.Client,
  },
  {
    path: 'reservar/**',
    renderMode: RenderMode.Client,
  },
  {
    path: 'mi-cuenta/**',
    renderMode: RenderMode.Client,
  },
  {
    path: 'admin/**',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
