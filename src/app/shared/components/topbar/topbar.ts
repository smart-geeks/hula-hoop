import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  private readonly authDialog = viewChild.required(AuthDialog);

  readonly drawerVisible = signal(false);
  readonly isLoggedIn = this.auth.isLoggedIn;
  readonly isAdmin = this.auth.isAdmin;

  onBookParty(): void {
    // TODO: navigate to booking flow
  }

  onLogin(): void {
    this.authDialog().open('login');
  }

  async onLogout(): Promise<void> {
    await this.auth.logout();
  }
}
