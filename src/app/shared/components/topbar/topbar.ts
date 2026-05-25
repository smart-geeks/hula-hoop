import { ChangeDetectionStrategy, Component, effect, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { AuthService } from '../../../core/services/auth.service';
import { PublicVenueService } from '../../../core/services/public-venue.service';
import { AuthDialog } from '../auth-dialog/auth-dialog';
import { PwaInstallButton } from '../pwa-install-button/pwa-install-button';

type DialogView = 'login' | 'register' | 'forgot-password';

@Component({
  selector: 'app-topbar',
  imports: [RouterLink, ButtonModule, DrawerModule, AuthDialog, PwaInstallButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  templateUrl: './topbar.html',
})
export class Topbar {
  private readonly auth        = inject(AuthService);
  private readonly router      = inject(Router);
  private readonly publicVenue = inject(PublicVenueService);
  private readonly authDialog  = viewChild<AuthDialog>('authDialogRef');

  readonly drawerVisible = signal(false);
  readonly authDialogRequested = signal(false);
  private readonly pendingDialogView = signal<DialogView | null>(null);

  readonly isLoggedIn = this.auth.isLoggedIn;
  readonly isAdmin = this.auth.isAdmin;

  constructor() {
    effect(() => {
      const dialog = this.authDialog();
      const view = this.pendingDialogView();
      if (dialog && view) {
        dialog.open(view);
        this.pendingDialogView.set(null);
      }
    });
  }

  onBookParty(): void {
    const slug = this.publicVenue.activeVenue()?.slug;
    this.router.navigate(slug
      ? ['/', slug, 'reservar', 'fiesta-privada']
      : ['/']);
  }

  onChangeVenue(): void {
    this.publicVenue.clearPreferredVenue();
    this.router.navigate(['/']);
  }

  onLogin(): void {
    this.authDialogRequested.set(true);
    this.pendingDialogView.set('login');
  }

  async onLogout(): Promise<void> {
    await this.auth.logout();
    const slug = this.publicVenue.activeVenue()?.slug;
    this.router.navigate(slug ? ['/', slug] : ['/']);
  }

  async scrollToSection(id: string): Promise<void> {
    const slug    = this.publicVenue.activeVenue()?.slug;
    const homeUrl = slug ? `/${slug}` : '/';

    if (this.router.url !== homeUrl) {
      await this.router.navigate(slug ? ['/', slug] : ['/']);
    }
    // 350ms permite que el Drawer mobile termine de animar y libere el overflow-hidden del body
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
  }
}
