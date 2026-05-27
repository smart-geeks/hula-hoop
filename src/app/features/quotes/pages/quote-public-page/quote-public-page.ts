import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { QuoteService } from '../../../../core/services/quote.service';
import { VenueService } from '../../../../core/services/venue.service';
import type { Quote } from '../../../../core/interfaces/quote';

@Component({
  selector: 'app-quote-public-page',
  templateUrl: './quote-public-page.html',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuotePublicPage {
  private readonly quoteService  = inject(QuoteService);
  private readonly venueService  = inject(VenueService);
  private readonly route         = inject(ActivatedRoute);
  private readonly router        = inject(Router);

  readonly loading    = signal(true);
  readonly notFound   = signal(false);
  readonly quote      = signal<Quote | null>(null);
  readonly venueSlug  = signal<string | null>(null);

  constructor() {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.notFound.set(true);
      this.loading.set(false);
    } else {
      this.loadQuote(token);
    }
  }

  private async loadQuote(token: string): Promise<void> {
    const q = await this.quoteService.getByPublicToken(token);
    if (!q) {
      this.notFound.set(true);
    } else {
      this.quote.set(q);
      const venue = await this.venueService.getVenueById(q.venue_id);
      this.venueSlug.set(venue?.slug ?? null);
    }
    this.loading.set(false);
  }

  approveAndPay(): void {
    const q = this.quote();
    const slug = this.venueSlug();
    if (!q || !slug) return;
    this.router.navigate(['/', slug, 'reservar', 'fiesta-privada'], {
      queryParams: { quote_id: q.id },
    });
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
