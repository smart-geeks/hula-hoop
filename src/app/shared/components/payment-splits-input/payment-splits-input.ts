import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { CurrencyMxnPipe } from '../../../core/pipes/currency-mxn.pipe';
import type { PaymentSplit } from '../../../core/interfaces/contract';

@Component({
  selector: 'app-payment-splits-input',
  templateUrl: './payment-splits-input.html',
  imports: [CurrencyMxnPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentSplitsInputComponent {
  readonly total  = input.required<number>();
  readonly splits = model<PaymentSplit[]>([]);

  readonly methodOptions: { value: PaymentSplit['metodo']; label: string; icon: string }[] = [
    { value: 'efectivo',      label: 'Efectivo',      icon: 'pi-money-bill'  },
    { value: 'tarjeta',       label: 'Tarjeta',       icon: 'pi-credit-card' },
    { value: 'transferencia', label: 'Transferencia', icon: 'pi-send'        },
  ];

  readonly remaining = computed(() => {
    const sum = this.splits().reduce((s, sp) => s + (sp.monto || 0), 0);
    return Math.round((this.total() - sum) * 100) / 100;
  });

  readonly remainingCents = computed(() => Math.round(this.remaining() * 100));

  readonly remainingIsPositive = computed(() => this.remaining() > 0.01);

  readonly remainingIsNegative = computed(() => this.remaining() < -0.01);

  readonly hasRemainder = computed(
    () => this.remainingIsPositive() || this.remainingIsNegative(),
  );

  readonly isValid = computed(
    () =>
      this.splits().length > 0 &&
      this.splits().every((sp) => sp.monto > 0) &&
      !this.hasRemainder(),
  );

  readonly canAddSplit = computed(() => this.splits().length < 3);

  isMethodUsedElsewhere(rowIndex: number, method: PaymentSplit['metodo']): boolean {
    return this.splits().some((s, i) => i !== rowIndex && s.metodo === method);
  }

  addSplit(): void {
    const current  = this.splits();
    if (current.length >= 3) return;
    const used     = current.map((s) => s.metodo);
    const next     = (this.methodOptions.find((m) => !used.includes(m.value))?.value) ?? 'tarjeta';
    const rem      = Math.max(0, this.remaining());
    this.splits.update((list) => [...list, { metodo: next, monto: rem }]);
  }

  removeSplit(index: number): void {
    if (this.splits().length <= 1) return;
    this.splits.update((list) => list.filter((_, i) => i !== index));
  }

  updateMonto(index: number, raw: string): void {
    const val  = parseFloat(raw);
    const monto = isNaN(val) ? 0 : Math.max(0, val);
    const list  = this.splits().map((s, i) => (i === index ? { ...s, monto } : s));
    // Auto-fill second row remainder when exactly 2 splits
    if (list.length === 2 && index === 0) {
      const rem = Math.max(0, Math.round((this.total() - monto) * 100) / 100);
      list[1] = { ...list[1], monto: rem };
    }
    this.splits.set(list);
  }

  updateMetodo(index: number, metodo: string): void {
    const method = metodo as PaymentSplit['metodo'];
    this.splits.update((list) =>
      list.map((s, i) => (i === index ? { ...s, metodo: method } : s)),
    );
  }
}
