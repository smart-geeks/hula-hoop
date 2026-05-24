import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-admin-denegado',
  templateUrl: './admin-denegado.html',
  imports: [RouterModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDenegado {
  private readonly router = inject(Router);

  goHome(): void {
    this.router.navigate(['/admin/hoy']);
  }
}
