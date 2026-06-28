import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';

type WizardStep = 1 | 2 | 3 | 4 | 5;

@Component({
  selector: 'app-admin-quote-wizard',
  templateUrl: './admin-quote-wizard.html',
  imports: [CurrencyMxnPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminQuoteWizard {
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);

  readonly currentStep = signal<WizardStep>(1);
  readonly editMode    = signal(false);
  readonly loading     = signal(false);

  readonly stepLabels: { n: WizardStep; label: string }[] = [
    { n: 1, label: 'Cliente' },
    { n: 2, label: 'Fecha / Hora' },
    { n: 3, label: 'Paquete' },
    { n: 4, label: 'Extras' },
    { n: 5, label: 'Resumen' },
  ];

  constructor() {
    if (this.route.snapshot.params['id']) this.editMode.set(true);
  }

  goBack(): void { void this.router.navigate(['/admin/cotizaciones']); }
  goToStep(n: WizardStep): void { this.currentStep.set(n); }
  prev(): void { const s = this.currentStep(); if (s > 1) this.currentStep.set((s - 1) as WizardStep); }
  next(): void { const s = this.currentStep(); if (s < 5) this.currentStep.set((s + 1) as WizardStep); }
}
