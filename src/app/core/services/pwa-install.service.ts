import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

// BeforeInstallPromptEvent no es parte del estándar TypeScript todavía
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type InstallPlatform = 'android' | 'ios' | 'desktop' | 'none';

@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private readonly platformId = inject(PLATFORM_ID);
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  /** Plataforma detectada */
  readonly platform = signal<InstallPlatform>('none');

  /** true si la app puede (o puede guiarse a) instalarse */
  readonly canInstall = signal(false);

  /** true cuando el usuario ya instaló / está en standalone */
  readonly isInstalled = signal(false);

  /** Controla visibilidad del modal de instrucciones iOS */
  readonly showIosModal = signal(false);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    const ua           = navigator.userAgent.toLowerCase();
    const isIos        = /iphone|ipad|ipod/.test(ua);
    const isMac        = /macintosh/.test(ua);
    const isInStandalone =
      ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true) ||
      window.matchMedia('(display-mode: standalone)').matches;

    this.isInstalled.set(isInStandalone);

    if (isInStandalone) return; // ya está instalada, no mostrar nada

    if (isIos) {
      // Safari en iOS: detectar si es Safari (no Chrome/Firefox que no soportan A2HS)
      const isSafari = /safari/.test(ua) && !/chrome|crios|fxios/.test(ua);
      if (isSafari) {
        this.platform.set('ios');
        this.canInstall.set(true);
      }
    } else {
      // Android o Desktop (Chrome, Edge, Samsung Internet…)
      const platform: InstallPlatform = isMac || /windows|linux/.test(ua) ? 'desktop' : 'android';

      window.addEventListener('beforeinstallprompt', (e: Event) => {
        e.preventDefault();
        this.deferredPrompt = e as BeforeInstallPromptEvent;
        this.platform.set(platform);
        this.canInstall.set(true);
      });

      // Si ya pasó el evento antes de que el servicio iniciara (raro pero posible)
      window.addEventListener('appinstalled', () => {
        this.canInstall.set(false);
        this.isInstalled.set(true);
        this.deferredPrompt = null;
      });
    }
  }

  /** Dispara el prompt de instalación nativo (Android/Desktop) o abre el modal de instrucciones (iOS) */
  async install(): Promise<void> {
    if (this.platform() === 'ios') {
      this.showIosModal.set(true);
      return;
    }

    if (!this.deferredPrompt) return;

    await this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      this.canInstall.set(false);
      this.deferredPrompt = null;
    }
  }

  dismissIosModal(): void {
    this.showIosModal.set(false);
  }
}
