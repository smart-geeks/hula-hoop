import { ViewportScroller } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { AuthService } from '../../../core/services/auth.service';
import { AuthDialog } from '../auth-dialog/auth-dialog';

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
  private readonly scroller = inject(ViewportScroller);
  private readonly authDialog = viewChild.required(AuthDialog);

  readonly drawerVisible = signal(false);
  readonly isLoggedIn = this.auth.isLoggedIn;
  readonly isAdmin = this.auth.isAdmin;

  onBookParty(): void {
    this.router.navigate(['/reservar/fiesta-privada']);
  }

  onLogin(): void {
    this.authDialog().open('login');
  }

  async onLogout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/']);
  }

  async scrollToContact(): Promise<void> {
    if (this.router.url !== '/') {
      await this.router.navigate(['/']);
    }
    setTimeout(() => {
      document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}
