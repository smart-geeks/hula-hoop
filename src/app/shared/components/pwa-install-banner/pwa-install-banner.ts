import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PwaInstallService } from '../../../core/services/pwa-install.service';

const DISMISSED_KEY = 'hh_pwa_banner_dismissed_at';
const DISMISS_TTL_DAYS = 7;
const SHOW_DELAY_MS = 7000;

@Component({
  selector: 'app-pwa-install-banner',
  templateUrl: './pwa-install-banner.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PwaInstallBanner implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  readonly pwa = inject(PwaInstallService);

  readonly visible  = signal(false);
  readonly animated = signal(false); // controla la animación slide-up

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // No mostrar si ya está instalada o no aplica
    if (!this.pwa.canInstall() || this.pwa.isInstalled()) return;

    // No mostrar si fue descartado recientemente
    if (this.wasRecentlyDismissed()) return;

    setTimeout(() => {
      if (!this.pwa.canInstall()) return; // pudo haber cambiado
      this.visible.set(true);
      // Pequeño delay para que el enter animation sea visible
      setTimeout(() => this.animated.set(true), 50);
    }, SHOW_DELAY_MS);
  }

  install(): void {
    this.pwa.install(); // dispara prompt nativo o abre modal iOS
    // Para Android/Desktop cerramos el banner; iOS mantiene el banner hasta
    // que el usuario cierre el modal manualmente, así que también cerramos.
    this.close(false);
  }

  close(persist = true): void {
    this.animated.set(false);
    setTimeout(() => this.visible.set(false), 350);
    if (persist) this.saveDismissed();
  }

  get labelCta(): string {
    return this.pwa.platform() === 'ios' ? 'Ver cómo instalar' : 'Instalar gratis';
  }

  get titleText(): string {
    switch (this.pwa.platform()) {
      case 'ios':     return 'Agrega Hula Hoop a tu inicio';
      case 'android': return 'Instala Hula Hoop en tu celular';
      default:        return 'Instala Hula Hoop en tu escritorio';
    }
  }

  get subtitleText(): string {
    switch (this.pwa.platform()) {
      case 'ios':     return 'Acceso rápido desde tu pantalla de inicio, sin App Store.';
      case 'android': return 'Acceso rápido, notificaciones y funciona sin conexión.';
      default:        return 'Abre la app directo desde tu escritorio, sin navegador.';
    }
  }

  private wasRecentlyDismissed(): boolean {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      if (!raw) return false;
      const dismissedAt = parseInt(raw, 10);
      const ttlMs = DISMISS_TTL_DAYS * 24 * 60 * 60 * 1000;
      return Date.now() - dismissedAt < ttlMs;
    } catch {
      return false;
    }
  }

  private saveDismissed(): void {
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch {}
  }
}
