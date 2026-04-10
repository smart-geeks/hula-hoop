import { ChangeDetectionStrategy, Component, effect, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { AuthService } from '../../../core/services/auth.service';
import { AuthDialog } from '../auth-dialog/auth-dialog';

type DialogView = 'login' | 'register' | 'forgot-password';

@Component({
  selector: 'app-topbar',
  imports: [RouterLink, ButtonModule, DrawerModule, AuthDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  templateUrl: './topbar.html',
})
export class Topbar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly authDialog = viewChild<AuthDialog>('authDialogRef');

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
    this.router.navigate(['/reservar/fiesta-privada']);
  }

  onLogin(): void {
    this.authDialogRequested.set(true);
    this.pendingDialogView.set('login');
  }

  async onLogout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/']);
  }

  async scrollToSection(id: string): Promise<void> {
    if (this.router.url !== '/') {
      await this.router.navigate(['/']);
    }
    // 350ms permite que el Drawer mobile termine de animar y libere el overflow-hidden del body
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
  }
}
