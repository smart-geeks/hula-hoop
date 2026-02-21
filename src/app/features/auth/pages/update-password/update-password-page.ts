import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-update-password-page',
  imports: [ReactiveFormsModule, ButtonModule, PasswordModule, MessageModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './update-password-page.html',
})
export class UpdatePasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly success = signal(false);

  readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
  });

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { password, confirmPassword } = this.form.getRawValue();

    if (password !== confirmPassword) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    const { error } = await this.auth.updatePassword(password);

    this.loading.set(false);

    if (error) {
      this.errorMessage.set(error.message);
    } else {
      this.success.set(true);
    }
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
