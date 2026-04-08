import { Pipe, PipeTransform } from '@angular/core';

/** Converts cents (int) to formatted MXN currency string */
@Pipe({ name: 'currencyMxn' })
export class CurrencyMxnPipe implements PipeTransform {
  transform(cents: number | null | undefined): string {
    if (cents == null) return '$0';
    const amount = cents / 100;
    return `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
}
