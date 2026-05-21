import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { QuoteService } from '../../../../core/services/quote.service';
import type { Quote } from '../../../../core/interfaces/quote';

@Component({
  selector: 'app-quote-public-page',
  templateUrl: './quote-public-page.html',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuotePublicPage implements OnInit {
  private readonly quoteService = inject(QuoteService);
  private readonly route        = inject(ActivatedRoute);

  readonly loading  = signal(true);
  readonly notFound = signal(false);
  readonly quote    = signal<Quote | null>(null);

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    const q = await this.quoteService.getByPublicToken(token);
    if (!q) {
      this.notFound.set(true);
    } else {
      this.quote.set(q);
    }
    this.loading.set(false);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  printPdf(): void {
    window.print();
  }
}
