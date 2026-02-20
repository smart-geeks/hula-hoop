import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
} from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { InputMaskModule } from 'primeng/inputmask';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../../core/services/auth.service';

type DialogView = 'login' | 'register' | 'forgot-password';

@Component({
  selector: 'app-auth-dialog',
  imports: [
    ReactiveFormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    InputMaskModule,
    MessageModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-dialog.html',
})
export class AuthDialog {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly visible = signal(false);
  readonly activeView = signal<DialogView>('login');
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly dialogHeader = computed(() => {
    switch (this.activeView()) {
      case 'login':
        return 'Log In';
      case 'register':
        return 'Create Account';
      case 'forgot-password':
        return 'Reset Password';
    }
  });

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly registerForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    confirmEmail: ['', [Validators.required, Validators.email]],
    phone: [''],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
  });

  readonly forgotForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  open(view: DialogView = 'login'): void {
    this.activeView.set(view);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.loginForm.reset();
    this.registerForm.reset();
    this.forgotForm.reset();
    this.visible.set(true);
  }

  switchTo(view: DialogView): void {
    this.activeView.set(view);
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  onDialogHide(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.loading.set(false);
  }

  async onLogin(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.loginForm.getRawValue();
    const { error } = await this.auth.login(email, password);

    this.loading.set(false);

    if (error) {
      this.errorMessage.set(error.message);
    } else {
      this.visible.set(false);
    }
  }

  async onRegister(): Promise<void> {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const values = this.registerForm.getRawValue();

    if (values.email !== values.confirmEmail) {
      this.errorMessage.set('Email addresses do not match.');
      return;
    }

    if (values.password !== values.confirmPassword) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    const { error } = await this.auth.register({
      fullName: values.fullName,
      email: values.email,
      phone: values.phone,
      password: values.password,
    });

    this.loading.set(false);

    if (error) {
      this.errorMessage.set(error.message);
    } else {
      this.visible.set(false);
    }
  }

  async onForgotPassword(): Promise<void> {
    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const { email } = this.forgotForm.getRawValue();
    const { error } = await this.auth.resetPassword(email);

    this.loading.set(false);

    if (error) {
      this.errorMessage.set(String(error));
    } else {
      this.successMessage.set(
        'Check your email for the password reset link.',
      );
    }
  }
}
